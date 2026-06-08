# Postiz 架构分析 —— 中国平台 Connector 开发方案

> 📅 2026-06-08 周一 · 知惠架构调研笔记
> 🔗 [Postiz GitHub](https://github.com/gitroomhq/postiz-app) · Apache-2.0

---

## 一、Postiz 是什么

开源社交媒体排程工具，替代 Buffer/Hootsuite。技术栈：**NestJS 后端 + Vite React 19 前端 + PostgreSQL + Redis + Temporal 工作流引擎**，pnpm monorepo。AGPL-3.0 许可证。

核心能力：统一管理 30+ 平台的内容发布、分析、团队协作。

---

## 二、Provider 架构 —— 两层契约

每个平台是一个 **Provider 类**，实现 `SocialProvider` 接口 + 继承 `SocialAbstract` 基类。

### SocialProvider 接口（social.integrations.interface.ts）

**必须实现：**
| 成员 | 用途 |
|------|------|
| `identifier` | 唯一标识符（如 `'devto'`） |
| `name` | UI 显示名称 |
| `scopes` | OAuth 权限作用域 |
| `editor` | 富文本编辑器类型 |
| `isBetweenSteps` | 是否多步骤连接 |
| `maxLength()` | 动态字符限制 |
| `generateAuthUrl()` | OAuth 授权 URL |
| `authenticate()` | 令牌交换 |
| `refreshToken()` | 刷新令牌 |
| `post()` | 发布内容 → 核心方法 |

**可选扩展：** comment / analytics / postAnalytics / customFields / mention / fetchPageInformation / changeNickname / changeProfilePicture / missing

### SocialAbstract 基类（social.abstract.ts）

继承即得：自动重试（429/500 最多 3 次，间隔 5s）、401 自动刷新令牌、限流检测、并发控制。所有 HTTP 调用必须用 `this.fetch()` 不能用原生 `fetch()`。

---

## 三、注册方式 —— 为什么必须 Fork

**没有插件系统，没有热加载。** 新增 Provider 必须改两个核心文件：

1. **`integration.manager.ts`** — 在 `socialIntegrationList` 数组中添加 `new MyProvider()`
2. **`all.providers.settings.ts`** — 在 `AllProvidersSettings` 联合类型 + `allProviders()` 函数中注册 DTO

Provider 文件位置：`libraries/nestjs-libraries/src/integrations/social/my-platform.provider.ts`

### 三种认证模式（+ Chrome Extension 模式）

| 模式 | 典型平台 | 关键特征 |
|------|---------|---------|
| **API Key** | Dev.to, Hashnode | `generateAuthUrl()` 返回随机状态，`authenticate()` 在 code 参数收 base64 编码 |
| **标准 OAuth 2.0** | Mastodon, X, LinkedIn | 完整授权码流程 + 令牌刷新 |
| **外部实例 OAuth** | 自托管 Mastodon | `externalUrl()` 让用户提供实例 URL，动态注册 OAuth App |
| **Chrome Extension Cookie** | Skool | `isChromeExtension = true` + `extensionCookies` 定义需抓取的 Cookie，通过浏览器扩展完成认证

> ⚠️ 中国平台（微信/微博/小红书/抖音）的认证模式与上述四种都不完全匹配——QR 码扫码登录、小程序授权、短信验证码……需要扩展 `SocialProvider` 接口。

### 前端也需要注册 —— 不止改后端

新增 Provider 不只是后端两个文件，前端也有三处必须改：

**1. Provider 设置表单组件**（必须）
```
apps/frontend/src/components/new-launch/providers/{platform}/
  └── {platform}.provider.tsx    ← 每个平台一个，平台专属设置 UI
```
目前有 36 个前端 Provider 目录（如 `x/x.provider.tsx`, `devto/devto.provider.tsx`），每个中国平台都要建一个。

**2. ContinueProvider 多步骤连接流程**（中国平台大概率需要）
```
apps/frontend/src/components/new-launch/providers/continue-provider/
  ├── list.tsx                         ← 步骤注册表
  ├── with-continue-provider.tsx       ← 步骤编排 HOC
  ├── linkedin/linkedin.continue.tsx   ← LinkedIn 多步骤模板（参考）
  ├── youtube/youtube.continue.tsx
  ├── facebook/facebook.continue.tsx
  ├── instagram/instagram.continue.tsx
  └── gmb/gmb.continue.tsx
```
LinkedIn、Instagram、YouTube、Facebook、GMB 有分步骤连接流程（例如：选账号 → 授权 → 确认）。**微信小程序授权（先扫码关注 → 再授权 → 再绑定）天然适配这套流程。** Phase 2 "扩展认证接口"应优先评估复用 ContinueProvider 而非修改 `SocialProvider` 接口。

**3. Icon 图标注册**
图标在 `apps/frontend/src/components/ui/icons/index.tsx` 统一导出，新增平台需要添加 SVG 图标。

---

## 四、设置 DTO —— 帖子级配置

需要平台特定字段（标题、标签、可见性等）时定义 DTO，位置：
`libraries/nestjs-libraries/src/dtos/posts/providers-settings/`

使用 `class-validator` 装饰器，注册到 `all.providers.settings.ts`。

| 复杂度 | 代码量 | 示例 |
|--------|--------|------|
| 极简 | ~7 方法 | Mastodon, Bluesky |
| 标准 | 8-10 方法 | **Dev.to（189行）** ← 最佳模板 |
| 高级 | 12-15 方法 | X（727行） |

---

## 五、AI Agent 集成 —— `@Rules` 和 `@Plug` 装饰器

Postiz 内置了 AI Agent 系统（基于 Mastra + LangChain），Agent 可以自动创建和排程帖子。要让 Agent 正确使用新平台，必须提供两个装饰器：

### @Rules 装饰器

```typescript
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

@Rules(`微博最多 140 字，可以包含最多 9 张图片...`)
export class WeiboProvider extends SocialAbstract implements SocialProvider { ... }
```

`@Rules` 用自然语言描述平台的发帖限制（字数、媒体数量、格式要求等），AI Agent 在生成内容时会读取这些约束来确保合规。**每个中国平台 Provider 必须标注**，否则 Agent 发帖可能越界。

### @Plug 装饰器

```typescript
import { Plug } from '@gitroom/helpers/decorators/plug.decorator';

export class WeiboProvider ... {
  @Plug({
    identifier: 'weibo-sync',
    title: 'Sync Weibo Analytics',
    description: 'Pull analytics every 6 hours',
    runEveryMilliseconds: 21600000,
    totalRuns: -1, // unlimited
    fields: [{ name: 'metric', description: 'Metric type', ... }]
  })
  async syncAnalytics() { ... }
}
```

`@Plug` 定义可被定时调度的扩展功能（如拉取分析数据），会被 `IntegrationManager.getAllPlugs()` 收集。

---

## 六、`SocialAbstract` 可覆盖的能力

除了文档第四节描述的继承即得能力，`SocialAbstract` 还有几个**可覆盖**的关键方法，中国平台大概率需要：

### handleErrors() —— 处理中国平台专属错误码

```typescript
// XProvider 覆盖示例
override handleErrors(body: string) {
  if (body.includes('You are not permitted')) {
    return { type: 'bad-body', value: '权限不足' };
  }
  if (body.includes('Service Unavailable')) {
    return { type: 'retry', value: '服务暂不可用' };
  }
}
```

微信有 `errcode` 体系（40001=无效 token、45009=API 调用超限），抖音、微博也各有专属错误码。每个中国平台 Provider **必须覆盖** `handleErrors()` 来映射这些错误码到 `refresh-token` / `bad-body` / `retry` 三种错误类型。

### 其他可覆盖项

| 方法/属性 | 用途 | 中国平台场景 |
|-----------|------|-------------|
| `checkValidity()` | 自定义媒体校验 | 小红书笔记模板校验 |
| `checkScopes()` | 权限作用域校验 | 微信多作用域验证 |
| `maxConcurrentJob` | 并发限制 | 中国 API 往往有更严格的 QPS 限制 |
| `mention()` | @提及搜索 | 微博 @用户、公众号搜用户 |
| `stripLinks` | 是否自动移除链接 | 部分平台不允许外链 |

---

## 七、国际化和 `t()` 函数

Postiz 用 `i18next` 做国际化，`t()` 函数是**全项目最核心的节点**（187 条边，代码库 God Node #1）。新增平台所有 UI 文本都必须走翻译系统。

关键文件：
- `libraries/react-shared-libraries/src/translation/locales/{lang}/translation.json` — 多语言翻译文件
- 新增平台需在翻译 JSON 中添加对应的 key（如 `weibo_settings`、`douyin_tags` 等）

不能用硬编码中文字符串，必须通过 `t('key_name')` 引用。

---

## 八、令牌刷新后台工作流

`RefreshIntegrationService`（`libraries/nestjs-libraries/src/integrations/refresh.integration.service.ts`）通过 **Temporal 工作流引擎** 在后台自动刷新过期令牌。

```typescript
// 核心流程
async refresh(integration: Integration) {
  const socialProvider = this._integrationManager.getSocialIntegration(id);
  const refresh = await socialProvider.refreshToken(integration.refreshToken);
  await this._integrationService.createOrUpdateIntegration(...);
}
```

中国平台的令牌往往**有效期很短**（微信 access_token 仅 2 小时，需用 refresh_token 续期），需要确保 `refreshToken()` 实现正确，并在 `refreshCron = true` 启用定期刷新。

---

## 九、中国平台特殊挑战

| 挑战 | Postiz 现状 | 需要做的 |
|------|------------|---------|
| 认证方式 | 仅 OAuth2 / API Key | 扩展接口支持 QR 码、短信验证、小程序授权 |
| 内容审核 API | 无此概念 | 新增审核状态机 + 异步回调 |
| 多平台矩阵 | 一个账号一个平台 | 微信（公众号+视频号+小程序）需多子类型 |
| 素材格式 | 图片+视频 | 微博九宫格、抖音话题标签、小红书笔记模板 |
| 数据存储合规 | GDPR 假设 | 需考虑中国数据本地化要求 |

---

## 十、Fork 策略

```
上游 main ←── fork（kenyonxu/postiz-app）←── 主人开发
  ↑                                              │
  └────────── 稳定后选择性向上游提 PR ─────────────┘
```

### 实施路线

1. **Phase 1** — Fork → 本地跑通 → 新增知乎 Provider（简单 API Key 模式），走通完整链路：Provider 类 + DTO + integration.manager 注册 + all.providers.settings 注册 + 前端设置组件 + Icon + i18n 翻译键
2. **Phase 2** — 实现微博 + 小红书 connector（标准 OAuth + 图文内容），包含 `@Rules`、`handleErrors()`
3. **Phase 3** — 实现抖音 + 哔哩哔哩 connector（视频分片上传专项），抖音三阶段分片 + B站五阶段 UPOS，在 Provider 层抽取共用分片逻辑
4. **Phase 4** — 微信（公众号+视频号）connector，利用 ContinueProvider 多步骤流程处理小程序授权
5. **Phase 5** — 与 Postiz Agent CLI 集成，实现 AI 辅助排程

### 建议同步策略

- fork 后不直接改上游代码。新增 Provider 直接放 `libraries/nestjs-libraries/src/integrations/social/` 平级目录（与其他 34 个 Provider 同级），因为 `integration.manager.ts` 的注册表是扁平数组，子目录无实际收益。微信的多子类型（公众号+视频号）可以用目录组织共享认证逻辑：
  ```
  libraries/nestjs-libraries/src/integrations/social/
    ├── zhihu.provider.ts
    ├── weibo.provider.ts
    ├── xiaohongshu.provider.ts
    ├── douyin.provider.ts
    ├── bilibili.provider.ts
    └── wechat/
        ├── wechat.mp.provider.ts        ← 微信公众号（订阅号）
        └── wechat.channels.provider.ts  ← 微信视频号
  ```
- 前端组件对应放在 `apps/frontend/src/components/new-launch/providers/{platform}/`
- 接口扩展用 TypeScript 的 declaration merging 或 adapter 模式，避免大规模改上游
- 定期 `git fetch upstream && git merge`

---

## 十一、复杂度预估

| 平台 | 后端 | 前端 | 总预估 | 主要难点 |
|------|------|------|--------|---------|
| 知乎 | ~200 行 | ~80 行 | ~280 行 | API Key 认证 + 标签系统 |
| 微博 | ~400 行 | ~120 行 | ~520 行 | OAuth 2.0 + 九宫格图片 + `handleErrors` 错误码映射 |
| 小红书 | ~500 行 | ~150 行 | ~650 行 | 笔记模板排版 + 图片校验 `checkValidity` |
| 抖音 | ~500 行 | ~120 行 | ~620 行 | 视频分片上传 + 话题标签 + 严格 QPS 限制 |
| 哔哩哔哩 | ~600 行 | ~150 行 | ~750 行 | 五阶段 UPOS 上传 + CSRF + 分区/标签推荐 + refresh_token 一次性 |
| 微信（公众号+视频号） | ~600 行 | ~200 行 | ~800 行 | 多子类型 + ContinueProvider 多步骤 + 审核回调 + 短效 token 刷新 |

---

*🦊 知惠 · 牵星工作室 Postiz 调研 · 2026-06-08*
