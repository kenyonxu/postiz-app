# Postiz 中国平台 Connector 实施路线

> 📅 2026-06-08 · 牵星工作室 · 基于架构分析 + API 参考文档

---

## 总览

| Phase | 平台 | 后端 | 前端 | 周期 | 依赖 |
|-------|------|------|------|------|------|
| **1** | 知乎 | ~200 行 | ~80 行 | 3-5 天 | 无（试点） |
| **2** | 微博 + 小红书 | ~900 行 | ~270 行 | 1-2 周 | Phase 1 走通链路 |
| **3** | 抖音 + B站 | ~1100 行 | ~270 行 | 2-3 周 | Phase 2 OAuth 模式可复用 |
| **4** | 微信（公众号+视频号） | ~600 行 | ~200 行 | 2-3 周 | Phase 2/3 认证经验 + ContinueProvider |
| **5** | Agent CLI 集成 | ~300 行 | 0 | 1 周 | 所有 Provider 就绪 |

Phase 2/3 可部分并行（微博/小红书与抖音/B站共享 OAuth 模式，但视频上传专项需等 Phase 3 专项突破）。

---

## Phase 1：知乎（试点）🔵 当前阶段

### 目标

走通完整 Provider 开发链路：后端 Provider → DTO → 注册 → 前端组件 → Icon → i18n。
知乎选为试点原因：API Key 认证最简单，无 OAuth 流程，189 行的 Dev.to Provider 可直接参考。

### 需修改的文件

**后端（5 个新增 + 2 个注册）：**

| 文件 | 操作 | 预估行数 |
|------|------|---------|
| `libraries/nestjs-libraries/src/integrations/social/zhihu.provider.ts` | **新增** | ~150 |
| `libraries/nestjs-libraries/src/dtos/posts/providers-settings/zhihu.settings.dto.ts` | **新增** | ~30 |
| `libraries/nestjs-libraries/src/integrations/integration.manager.ts` | 注册 | +2 |
| `libraries/nestjs-libraries/src/dtos/posts/providers-settings/all.providers.settings.ts` | 注册 DTO | +3 |
| `libraries/helpers/src/utils/providers.settings.labels.ts` | 注册标签 | +5 |

**前端（3 个新增 + 2 个注册）：**

| 文件 | 操作 | 预估行数 |
|------|------|---------|
| `apps/frontend/src/components/new-launch/providers/zhihu/zhihu.provider.tsx` | **新增** | ~50 |
| `apps/frontend/src/components/ui/icons/zhihu-icon.tsx` | **新增** | ~20 |
| `apps/frontend/src/components/ui/icons/index.tsx` | 注册 Icon | +1 |
| `libraries/react-shared-libraries/src/translation/locales/zh/translation.json` | 翻译键 | +10 |
| `libraries/react-shared-libraries/src/translation/locales/en/translation.json` | 翻译键 | +10 |

### Provider 类骨架

```typescript
// libraries/nestjs-libraries/src/integrations/social/zhihu.provider.ts

import { SocialAbstract } from './social.abstract';
import { SocialProvider } from './social.integrations.interface';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

@Rules(`知乎回答支持 Markdown，无字数限制。文章模式需设置 title。`)
export class ZhihuProvider extends SocialAbstract implements SocialProvider {
  identifier = 'zhihu';
  name = '知乎';
  scopes = [] as string[];
  editor: 'none' | 'normal' | 'markdown' | 'html' = 'markdown';
  isBetweenSteps = false;
  oneTimeToken = true; // API Key 不需要刷新

  maxLength() { return Infinity; }

  // API Key 认证模式
  async generateAuthUrl() {
    const state = makeId(6);
    return { url: state, codeVerifier: makeId(10), state };
  }

  async customFields() {
    return [{
      key: 'apiKey',
      label: 'API Key',
      validation: `/^.{3,}$/`,
      type: 'password' as const,
    }];
  }

  async authenticate(params: { code: string }) {
    const body = JSON.parse(Buffer.from(params.code, 'base64').toString());
    // 用知乎 API 验证 apiKey → /api/v4/me
    const user = await this.fetch('https://api.zhihu.com/api/v4/me', {
      headers: { Authorization: `Bearer ${body.apiKey}` }
    }, 'zhihu');
    return {
      accessToken: body.apiKey,
      refreshToken: '',
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      id: user.id, name: user.name, username: user.url_token,
      picture: user.avatar_url,
    };
  }

  async post(id: string, accessToken: string, postDetails: PostDetails[], integration: any): Promise<PostResponse[]> {
    // 实现发布逻辑
  }

  override handleErrors(body: string) {
    const err = JSON.parse(body);
    if (err.error?.code === 401) return { type: 'refresh-token' as const, value: 'Token 过期' };
    if (err.error?.code === 429) return { type: 'retry' as const, value: '请求过频' };
    return undefined;
  }
}
```

### DTO 定义

```typescript
// libraries/nestjs-libraries/src/dtos/posts/providers-settings/zhihu.settings.dto.ts

export class ZhihuSettingsDto {
  @IsString() @MinLength(2) @IsDefined()
  title: string;  // 文章标题

  @IsOptional() @IsString()
  @Matches(/^(https?:\/\/).+/, { message: '无效 URL' })
  canonical?: string;  // 规范链接

  @IsOptional() @IsArray() @ArrayMaxSize(5)
  @Type(() => ZhihuTagDto) @ValidateNested({ each: true })
  tags: ZhihuTagDto[] = [];
}
```

### 验证标准

- [ ] `pnpm lint` 零报错
- [ ] 前端能看到知乎选项，连接流程走通（API Key 输入 → 验证 → 显示已连接）
- [ ] 发布测试：Markdown 内容 → 知乎成功发布 → Postiz 收到 `postId` + `releaseURL`
- [ ] 错误码映射：故意用无效 Key → 前端显示正确错误信息

### 注意事项

- 知乎 API Key 从 [知乎开放平台](https://open.zhihu.com/) 获取
- 知乎返回格式：`{ id, url_token, name, avatar_url }`
- 内容支持 Markdown，`editor` 设为 `markdown`
- 无需 OAuth，`scopes = []`，`oneTimeToken = true`

---

## Phase 2：微博 + 小红书

### 微博

- **认证**：OAuth 2.0（`scopes: ['friendships_groups_write', 'statuses_to_me_read']`）
- **@Rules**：`微博最多 140 字，可含最多 9 张图片（pic_ids 数组），视频需单独处理`
- **handleErrors**：报错格式 `{ error: "...", error_code: 10001 }`，10006=token 无效→refresh-token，10022=IP 白名单→bad-body
- **特殊**：九宫格 pic_ids、视频需先 upload API

### 小红书

- **认证**：OAuth 2.0（需 `$extra.note_api` 权限）
- **@Rules**：笔记模式（标题≤20字、正文≤1000字、图片≤9张），严格校验
- **handleErrors**：报错格式 `{ code: 2100005, success: false, msg: "..." }`，2100005=token 过期→refresh-token
- **特殊**：checkValidity() 校验笔记模板、图片必填（不能纯文字发布）

### 依赖

Phase 1 知乎走通后，微博/小红书可并行开发（共享 OAuth 2.0 模式）。

---

## Phase 3：抖音 + B站（视频专项）

### 抖音

- **认证**：OAuth 2.0（`scopes: ['video.create', 'video.data', 'data.external.user']`）
- **@Rules**：视频必填、话题标签用 #、封面图 1:1 比例、严格 QPS 限制（1 req/s）
- **上传**：三阶段分片——初始化 → 分片上传 → 完成上传
- **handleErrors**：`{ data: { error_code: 1004, description: "..." } }`，1004=token 无效→refresh-token，401=权限不足→bad-body

### B站

- **认证**：OAuth 2.0（`scopes: ['video:upload']`），refresh_token 一次性！必须每次全保存
- **@Rules**：视频必填、分区必选（tid）、支持标签 array、封面图 16:9
- **上传**：五阶段 UPOS——预申请 → 验证 → 分片上传 → 完成通知 → 轮询确认
- **handleErrors**：`{ code: -101, message: "账号未登录" }`—类似体系
- **特殊**：refresh_token 用完即弃需特殊处理、分区/标签有 GET API 可集成 @Tool 装饰器

### 视频上传共用逻辑

抖音和B站都有分片上传，建议抽取共享工具函数：
```
libraries/nestjs-libraries/src/integrations/social/shared/chunked-upload.ts
```

### 依赖

Phase 2 OAuth 经验可复用。抖音/B站可在 Phase 2 完成后并行开发。

---

## Phase 4：微信（公众号 + 视频号）

### 认证

- OAuth 2.0 网页授权（`scopes: ['snsapi_userinfo']`）
- access_token 仅 2 小时 → `refreshCron = true`
- **ContinueProvider** 多步骤：扫码关注 → 授权 → 绑定账号

### 目录结构

```
libraries/nestjs-libraries/src/integrations/social/wechat/
  ├── wechat.shared.ts              ← 共享认证逻辑
  ├── wechat.mp.provider.ts         ← 公众号
  └── wechat.channels.provider.ts   ← 视频号
```

### handleErrors

微信 `errcode` 体系：40001/40014→refresh-token、45009→retry、48001→bad-body

### 特殊

- 素材格式限制：图片≤2M(bmp/png/jpeg/jpg/gif)、语音≤2M(amr/mp3)≤60s
- 群发消息需通过微信内容审核 → 新增审核状态机

---

## Phase 5：Agent CLI 集成

### 目标

确保 Postiz 内置 AI Agent 能正确创建和排程中国平台内容。

### 需实现

- 所有 Provider 的 `@Rules` 装饰器已标注（Agent 读取平台限制）
- `@Tool` 装饰器暴露平台特有功能（知乎标签搜索、B站分区推荐等）
- `@Plug` 定时任务（微博分析拉取、微信 token 刷新监控）
- Postiz Agent CLI（`postiz-cli`）测试：`postiz ai "发一篇知乎文章..."`

---

## 附录：Postiz 项目关键文件速查

| 用途 | 路径 |
|------|------|
| Provider 接口 | `libraries/nestjs-libraries/src/integrations/social/social.integrations.interface.ts` |
| Provider 基类 | `libraries/nestjs-libraries/src/integrations/social/social.abstract.ts` |
| Provider 注册表 | `libraries/nestjs-libraries/src/integrations/integration.manager.ts` |
| DTO 注册表 | `libraries/nestjs-libraries/src/dtos/posts/providers-settings/all.providers.settings.ts` |
| 前端 Provider 组件 | `apps/frontend/src/components/new-launch/providers/{platform}/` |
| ContinueProvider | `apps/frontend/src/components/new-launch/providers/continue-provider/` |
| Icon 注册 | `apps/frontend/src/components/ui/icons/index.tsx` |
| 中文本地化 | `libraries/react-shared-libraries/src/translation/locales/zh/translation.json` |
| 参考 Provider（简单） | `libraries/nestjs-libraries/src/integrations/social/dev.to.provider.ts` |
| 参考 Provider（复杂） | `libraries/nestjs-libraries/src/integrations/social/x.provider.ts` |

---

*🦊 知惠 · 牵星工作室 · 2026-06-08*
