# 中国平台 API 开发文档参考

> 📅 2026-06-08 · Postiz Connector 开发资料

---

## 一、微信（公众号 + 视频号）

### 官方文档

| 入口 | 地址 |
|------|------|
| 微信开放文档 | `https://developers.weixin.qq.com/doc/` |
| 公众号开发 | `https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Overview.html` |
| 视频号 | 通过公众号体系接入，需单独申请 |

### 认证方式

- **OAuth 2.0 网页授权**：引导用户跳转微信 → 用户同意 → 回调获取 code → 换取 access_token
- access_token 有效期仅 **2 小时**，需用 refresh_token 续期
- 需 `refreshCron = true` + `RefreshIntegrationService` 定时刷新

### 关键接口

| 接口 | 用途 | Postiz 映射 |
|------|------|------------|
| 获取 access_token | GET `https://api.weixin.qq.com/cgi-bin/token` | `authenticate()` / `refreshToken()` |
| 群发消息 | POST `https://api.weixin.qq.com/cgi-bin/message/mass/sendall` | `post()` |
| 素材管理 | POST `https://api.weixin.qq.com/cgi-bin/material/add_material` | 媒体上传 |
| 自定义菜单 | POST `https://api.weixin.qq.com/cgi-bin/menu/create` | CustomFields |
| 用户管理 | GET `https://api.weixin.qq.com/cgi-bin/user/get` | `fetchPageInformation()` |

### 错误码体系

微信使用 `errcode` + `errmsg` 统一错误格式。关键错误码：

| errcode | 含义 | Postiz 错误类型 |
|---------|------|----------------|
| 40001 | access_token 无效/过期 | `refresh-token` |
| 40014 | access_token 不合法 | `refresh-token` |
| 45009 | API 调用超限 | `retry` |
| 48001 | 无 API 权限 | `bad-body` |

### 特殊挑战

- **多子类型**：公众号（订阅号/服务号）+ 视频号需不同 Provider，但共享认证逻辑 → 用 `wechat/` 子目录
- **审核机制**：群发消息需通过微信内容审核 → 新增审核状态机
- **模板消息**：高级接口需要认证服务号
- **素材格式限制**：图片 ≤ 2MB (bmp/png/jpeg/jpg/gif)，语音/视频各有独立限制

---

## 二、微博

### 官方文档

| 入口 | 地址 |
|------|------|
| 微博开放平台 | `https://open.weibo.com/` |
| API V2 文档 | `https://open.weibo.com/wiki/API文档_v2` |
| OAuth 授权 | `https://open.weibo.com/wiki/授权机制说明` |

### 认证方式

- **标准 OAuth 2.0**（Authorization Code Grant）
  - 授权 URL: `https://api.weibo.com/oauth2/authorize`
  - Token URL: `https://api.weibo.com/oauth2/access_token`
- Token 有效期分等级：测试 1 天 / 普通 7 天 / 中级 15 天 / 高级 30 天 / 合作 90 天
- 未审核应用处于测试级别，**access_token 仅 1 天** → 需要频繁刷新

### 关键接口

| 接口 | URL | Postiz 映射 |
|------|-----|------------|
| 发文字微博 | `POST /2/statuses/update.json` | `post()` |
| 发图片微博 | `POST /2/statuses/upload.json` | `post()` — 九宫格场景 |
| 发视频微博 | `POST /2/statuses/upload_url_text.json` | `post()` |
| 评论 | `POST /2/comments/create.json` | `comment()` |
| 获取用户信息 | `GET /2/users/show.json` | `fetchPageInformation()` |

### 特殊挑战

- **九宫格图片**：一次最多 9 张，需 `checkValidity()` 自定义校验
- **140 字限制**：`maxLength()` 返回 140
- **视频限制**：需单独申请视频发布权限
- **OAuth Scope**：发帖需要 `statuses_update` 和 `statuses_upload` 权限

### @Rules 模板

```
@Rules(`微博最多 140 字，可以包含最多 9 张图片作为九宫格展示，
视频需要单独申请权限。链接会自动生成短链。`)
```

---

## 三、小红书

### 官方文档

| 入口 | 地址 |
|------|------|
| 小红书开放平台 | `https://open.xiaohongshu.com` |
| JS SDK 文档 | `https://agora.xiaohongshu.com/doc/js` |
| API 文档（Apifox） | `https://xiaohongshu.apifox.cn` |

### 认证方式

- **SHA-256 签名认证**（非标准 OAuth）
  1. 服务端：appKey + nonce + timestamp → SHA-256 签名 → 获取 access_token
  2. access_token 作为密钥再签名 → 生成前端 JS SDK 调用参数
  3. 前端：`xhs.share()` 唤起小红书 App 发布

### 关键流程

```
注册开发者 → 创建应用 → 获取 appKey + appSecret
→ 服务端 SHA-256 签名 → GET /api/sns/v1/ext/access/token
→ 获得 access_token (24h)
→ 使用 access_token 二次签名 → 前端 xhs.share()
→ 唤起小红书 App → 用户编辑 → 发布
```

### 接口限制

| 限制项 | 值 |
|--------|-----|
| Token 有效期 | 24 小时 |
| 图片要求 | 服务器地址，不支持本地文件 |
| 笔记类型 | `normal`（图文）/ `video`（视频） |
| 认证模式 | 服务端签名 + 前端 JS SDK |

### 特殊挑战

- **非标准认证** — 不能用 SocialAbstract 的 `fetch()` 直接调，需要实现独立的签名逻辑
- **发布流程差异大** — Postiz 后端 `post()` 模式 vs 小红书前端 JS SDK 模式，架构上需要适配
- **需要 `checkValidity()` 自定义** — 笔记模板、图片排版规则与其他平台完全不同
- **素材需服务器公网地址** — 可能需要先上传到 Postiz 的 S3/存储再传 URL

---

## 四、抖音

### 官方文档

| 入口 | 地址 |
|------|------|
| 抖音开放平台 | `https://open.douyin.com/` |
| 内容发布方案 | `https://open.douyin.com/platform/resource/docs/ability/content-management/douyin-publish-solution/` |
| 视频上传 API | `https://open.douyin.com/platform/resource/docs/openapi/video-management/douyin/create/upload/` |
| 分片上传 | `https://open.douyin.com/platform/resource/docs/openapi/video-management/douyin/create/slice-init-upload/` |

### 认证方式

- **OAuth 2.0**：`POST https://open.douyin.com/oauth/access_token/`
- Scope: `video.create` 或 `video.create.bind`
- 同时需要 `access-token` + `open_id` 双重鉴权

### 关键接口

| 接口 | URL | 说明 |
|------|-----|------|
| 上传视频 | `POST /video/upload/` | multipart/form-data |
| 分片初始化 | `POST /video/part/init/` | 大文件必须分片 |
| 发布内容 | `POST /video/publish/` | 携带话题/POI/@用户 |
| 查询 POI | `GET /poi/search/keyword/` | 需单独申请权限 |

### 视频限制

| 限制项 | 值 |
|--------|-----|
| 文件大小 | ≤ 4GB（>128MB 必须分片，>50MB 建议分片） |
| 分片大小 | 5MB ~ 20MB |
| 时长 | ≤ 15 分钟 |
| 格式 | 推荐 mp4、webm |
| 水印 | **禁止**品牌 logo |

### 特殊挑战

- **分片上传**：大视频必须用分片 API，Postiz 现有 Provider 都没有分片上传逻辑 → 需要在 `SocialAbstract` 或 Provider 层新增
- **双重鉴权**：access_token + open_id，需扩展 `AuthTokenDetails` 或通过 `additionalSettings` 传
- **话题 + @用户 + POI**：`PostDetails.settings` 需要自定义 DTO 支持这些特殊字段
- **QPS 严格限制**：`maxConcurrentJob = 1`
- **权限申请门槛高**：需要提审，适用于"创作工具/内容社区"类应用

---

---

## 五、哔哩哔哩（B站）

### 官方文档

| 入口 | 地址 |
|------|------|
| 开放平台官网 | `https://openhome.bilibili.com/` |
| API 文档 | `https://openhome.bilibili.com/doc` |
| OAuth 授权 | `https://bilibili.apifox.cn/doc-7492454` |
| 社区参考 | [SocialSisterYi/bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect) |

### 认证方式

- **OAuth 2.0**：标准 Authorization Code 流程
  - Token URL: `POST /oauth/access_token`，参数 `client_id` + `client_secret` + `grant_type=authorization_code` + `code`
  - Scope: `ARC_BASE` 用于视频稿件投递
- ⚠️ **每个 refresh_token 只能使用一次**，刷新后立即失效

### 视频上传流程（UPOS 协议）

B站采用**多阶段管道式**上传，比抖音更复杂：

**阶段 1：封面上传**
```
POST https://member.bilibili.com/x/vu/web/cover/up
Body: cover (Base64) + csrf (bili_jct)
→ 返回 CDN 封面 URL
```

**阶段 2：预上传**
```
GET /x/vupre/web/upload/preupload
→ 返回 auth token、chunk_size (通常 4MB)、endpoint、upos_uri、upload_id
```

**阶段 3：分块上传（UPOS）**
```
PUT /{path}?partNumber={n}&uploadId={upload_id}
Host: {endpoint}
X-Upos-Auth: {auth}
Content-Type: application/octet-stream
→ 每块返回 ETag，后续合并用
```

**阶段 4：确认上传**
```
POST /x/vupre/web/upload/upload
→ 返回 aid（稿件ID）+ cid（分P ID）
```

**阶段 5：稿件提交**
```
POST https://member.bilibili.com/x/vu/web/add/v3
Content-Type: application/json
{
  "copyright": 1,           // 1=自制, 2=转载
  "title": "标题",           // 最长 80 字符
  "tid": 分区ID,
  "tag": "标签1,标签2",     // 逗号分隔，最多 12 个
  "desc": "简介",           // 最长 2000 字符
  "videos": [{ "filename": "xxx.mp4", "title": "P1", "desc": "", "cid": cid }],
  "cover": "封面URL",
  "csrf": "bili_jct"
}
→ 返回 { "code": 0, "data": { "aid": 123, "bvid": "BV1xx411c7mX" } }
```

### 辅助接口

| 接口 | 说明 |
|------|------|
| `GET /x/vupre/web/archive/category/list` | 分区查询 |
| `POST /x/vupre/web/typepre` | 根据标题预测分区 |
| `GET /x/vupre/web/tag/recommend` | 推荐标签 |
| `POST /x/vupre/web/archive/drafts` | 保存草稿 |
| `GET /x/vupre/web/archive/draft_list` | 草稿列表 |
| `POST /x/web/archive/delete` | 删除视频 |

### 限制

| 限制项 | 值 |
|--------|-----|
| 标题 | ≤ 80 字符 |
| 简介 | ≤ 2000 字符 |
| 标签 | ≤ 12 个 |
| 分片大小 | 4MB |
| 并发 | `maxConcurrentJob = 1` |
| refresh_token | **只能用一次** |

### 特殊挑战

- **五阶段上传流程**：封面→预上传→分块→确认→提交，比抖音的三阶段更复杂，每个阶段都可能失败
- **UPOS 协议**：非标准 HTTP 上传，分块 PUT 后需收集 ETag 合并
- **refresh_token 一次性**：与 Postiz 现有 `refreshToken()` 模型不完全一致，刷新后必须立即持久化新 token
- **CSRF 防护**：写操作需要 `bili_jct` token（从 Cookie 中提取），需在 `AuthTokenDetails` 中额外存储
- **分区 + 标签推荐**：AI Agent 可以用这些接口自动选择最佳分区和标签
- **BVID 系统**：返回的稿件 ID 是 BVID 格式（如 `BV1xx411c7mX`），不同于数字 ID

---

## 六、知乎

### 官方文档

| 入口 | 地址 |
|------|------|
| 知乎开放平台 | `https://open.zhihu.com/`（⚠️ 状态需确认） |
| API v4 参考 | 第三方整理：百度开发者中心、GitCode 博客 |

### 认证方式

- **OAuth 2.0**（Authorization Code + Client Credentials）
- Token URL: `POST https://www.zhihu.com/oauth/access_token`

### 关键接口

| 接口 | URL | Postiz 映射 |
|------|-----|------------|
| 发布文章 | `POST /api/v4/articles` | `post()` |
| 发布回答 | `POST /api/v4/answers` | `post()` |
| 点赞 | `POST /api/v4/answers/{id}/voting` | — |

### 特殊挑战

- **官方 API 状态不明**：知乎开放平台的注册入口和接口可用性需要实地验证
- 如果官方 API 不可用，可能降级为 RSS 导入 + 网页端手动发布

---

## 开发参考对照表

### 认证模式对比

| 平台 | 认证类型 | 复杂度 | Postiz 现有模式匹配度 |
|------|---------|--------|---------------------|
| 微信 | OAuth 2.0 + 短效 token | 高 | 类似标准 OAuth，需增强 refreshing |
| 微博 | 标准 OAuth 2.0 | 中 | **完全匹配** |
| 小红书 | SHA-256 签名 + JS SDK | 高 | **不匹配**，需架构适配 |
| 抖音 | OAuth 2.0 + 双重鉴权 | 中 | 部分匹配，需扩展 token 结构 |
| 哔哩哔哩 | OAuth 2.0 + CSRF | 高 | 基本匹配，但上传流程非常复杂 |
| 知乎 | OAuth 2.0 | 低 | **完全匹配**（API 版类似 Dev.to） |

### 发布方式对比

| 平台 | 发布方式 | Postiz post() 适配难度 |
|------|---------|----------------------|
| 微信 | REST API 群发 | 中（需处理审核回调） |
| 微博 | REST API POST | **低**（标准模式） |
| 小红书 | 前端 JS SDK 唤起 App | **高**（不是后端 REST 调用） |
| 抖音 | REST API 分片上传 + 发布 | 中（分片逻辑需要） |
| 哔哩哔哩 | REST API 五阶段 UPOS 上传 | **高**（流程最复杂） |
| 知乎 | REST API POST | **低**（标准模式） |

### 建议开发顺序

```
知乎（低风险验证）→ 微博（熟悉OAuth标准流程）→
抖音（视频分片上传）→ 哔哩哔哩（五阶段UPOS上传）→
微信（多子类型）→ 小红书（架构最大差异）
```

---

*🦊 知惠 · 牵星工作室 Postiz 调研 · 2026-06-08*
