# Postiz 知乎 Provider — Phase 1 Technical Spec

> 📅 2026-06-09 · 牵星工作室 · 基于 `docs/china-connectors/roadmap-中国平台Connector实施路线.md`
>
> **⚠️ 实地验证结果 (2026-06-09)**：知乎开放平台 (`developer.zhihu.com`) 已实测验证：
> - ✅ API 连通：Bearer token + `X-Request-Timestamp` 鉴权可用
> - ✅ 搜索接口可用：`zhihu_search`、`global_search`、`hot_list`
> - ❌ **无内容发布 API**：平台未公开文章/回答发布接口
> - **结论**：知乎不适合作为 Postiz 发布渠道 Connector。Provider 代码作为开发模式验证已完成，但 `post()` 方法指向的端点不存在于公开 API 中。Phase 1 试点建议切换为**微博**（标准 OAuth 2.0 + REST API 发布，确认可用）。
>
> **知乎代码价值保留**：Provider 类、DTO、前端组件、注册模式均可作为后续中国平台开发的参考模板。

---

## 1. 目标与范围

### 1.1 Phase 1 目标

走通 Postiz 中国平台 Connector 的**完整 Provider 开发链路**：

```
后端 Provider → DTO → 注册 → 前端组件 → Icon 图片 → i18n 翻译
```

### 1.2 为什么选知乎作为试点

| 维度 | 知乎 | 微博/小红书 | 抖音/B站 |
|------|------|------------|----------|
| 认证模式 | **API Key**（最简单） | OAuth 2.0 | OAuth 2.0 + 视频上传 |
| 内容类型 | Markdown 纯文本 | 图文+视频 | 视频为主 |
| 参考 Provider | Dev.to（189行，API Key 认证） | X / LinkedIn | TikTok / YouTube |
| 前端复杂度 | 低（标题+标签） | 中（图片+限长） | 高（视频+分片上传） |
| 开发周期 | 3-5 天 | 1-2 周 | 2-3 周 |

知乎选的 **API Key 认证模式** 是四种中国平台中最简单的，与 Dev.to Provider 完全同构，且无需处理视频上传、OAuth token 刷新等复杂问题。

### 1.3 交付物

- [x] 本 Spec 文档
- [ ] 后端 Provider 类（~150行）
- [ ] 后端 DTO 类（~30行）
- [ ] 后端注册（3处修改）
- [ ] 前端 Provider 组件（~50行）
- [ ] 平台 Icon（PNG 24×24 / 512×512）
- [ ] 中英文 i18n 翻译键
- [ ] `pnpm lint` 零报错
- [ ] 连接流程走通
- [ ] 发布测试通过

---

## 2. 架构概览

### 2.1 Postiz 三层架构中的位置

```
┌────────────────────────────────────────────────────────┐
│                    IntegrationManager                   │
│  (注册表：扫描所有 Provider，提供路由分发)               │
├────────────────────────────────────────────────────────┤
│  Controller Layer (apps/backend)                       │
│  └─ ChannelController / PostController                 │
│     └─ 调用 IntegrationManager.getSocialIntegration()  │
├────────────────────────────────────────────────────────┤
│  Service / Provider Layer (libraries/nestjs-libraries)  │
│  ┌─ SocialAbstract (基类)                              │
│  │  └─ fetch() 统一请求 + 错误处理 + retry             │
│  │  └─ handleErrors() 错误码 → 动作映射                │
│  │  └─ checkValidity() 媒体校验                        │
│  │  └─ checkScopes() 权限校验                          │
│  ├─ ZhihuProvider extends SocialAbstract               │  ← 新增
│  │  └─ authenticate()  API Key 验证                    │
│  │  └─ post()         发布文章                         │
│  │  └─ generateAuthUrl()  生成伪 state                 │
│  │  └─ customFields() API Key 输入框                   │
│  ├─ DevToProvider  (参考实现)                          │
│  ├─ XProvider, LinkedInProvider, ... 28个已有Provider   │
│  └─ SocialProvider Interface                           │
├────────────────────────────────────────────────────────┤
│  Repository Layer (libraries/database)                 │
│  └─ Prisma ORM → PostgreSQL                            │
└────────────────────────────────────────────────────────┘
```

### 2.2 Monorepo 落点

```
postiz-app/
├── libraries/
│   ├── nestjs-libraries/src/
│   │   ├── integrations/
│   │   │   ├── social/
│   │   │   │   ├── zhihu.provider.ts          ← 新建：知乎 Provider
│   │   │   │   ├── social.abstract.ts         ← 基类（不修改）
│   │   │   │   ├── social.integrations.interface.ts ← 接口（不修改）
│   │   │   │   └── dev.to.provider.ts         ← 参考实现
│   │   │   └── integration.manager.ts         ← 修改：注册 Provider
│   │   └── dtos/posts/providers-settings/
│   │       ├── zhihu.settings.dto.ts          ← 新建：知乎 DTO
│   │       └── all.providers.settings.ts      ← 修改：注册 DTO
│   ├── helpers/src/utils/
│   │   └── providers.settings.labels.ts       ← 可选：标签注册
│   └── react-shared-libraries/src/translation/locales/
│       ├── zh/translation.json                ← 修改：添加中文翻译键
│       └── en/translation.json                ← 修改：添加英文翻译键
├── apps/
│   └── frontend/src/
│       ├── components/
│       │   ├── new-launch/providers/
│       │   │   ├── zhihu/zhihu.provider.tsx   ← 新建：前端 Provider 组件
│       │   │   └── show.all.providers.tsx     ← 修改：注册前端 Provider
│       │   └── ui/icons/
│       │       └── index.tsx                   ← 可选：如需要 SVG Icon
│       └── public/icons/platforms/
│           └── zhihu.png                      ← 新建：平台 Icon（256×256 PNG）
```

---

## 3. 详细文件清单

### 3.1 新建文件（5个）

| # | 文件路径 | 类型 | 预估行数 | 说明 |
|---|---------|------|---------|------|
| 1 | `libraries/nestjs-libraries/src/integrations/social/zhihu.provider.ts` | Provider 类 | ~150 | 核心发布逻辑 |
| 2 | `libraries/nestjs-libraries/src/dtos/posts/providers-settings/zhihu.settings.dto.ts` | DTO 类 | ~30 | 设置校验 |
| 3 | `apps/frontend/src/components/new-launch/providers/zhihu/zhihu.provider.tsx` | 前端组件 | ~50 | 设置表单 |
| 4 | `apps/frontend/public/icons/platforms/zhihu.png` | 图标文件 | 二进制 | 256×256 PNG |
| 5 | `libraries/nestjs-libraries/src/dtos/posts/providers-settings/zhihu.tags.settings.dto.ts` | DTO 子类 | ~15 | 标签校验 DTO |

### 3.2 修改文件（7个）

| # | 文件路径 | 修改类型 | 操作 | 预估增加行数 |
|---|---------|---------|------|-------------|
| 6 | `libraries/nestjs-libraries/src/integrations/integration.manager.ts` | 注册 | +import + new | +2 |
| 7 | `libraries/nestjs-libraries/src/dtos/posts/providers-settings/all.providers.settings.ts` | 注册 DTO | +import + union + entry | +3 |
| 8 | `apps/frontend/src/components/new-launch/providers/show.all.providers.tsx` | 注册前端 | +import + entry | +2 |
| 9 | `libraries/react-shared-libraries/src/translation/locales/zh/translation.json` | i18n | +新增翻译键 | +10 |
| 10 | `libraries/react-shared-libraries/src/translation/locales/en/translation.json` | i18n | +新增翻译键 | +10 |

### 3.3 总览

| 维度 | 新增文件 | 修改文件 | 新增代码行 | 修改代码行 |
|------|---------|---------|-----------|-----------|
| 后端 | 3 | 2 | ~195 | +5 |
| 前端 | 2 | 3 | ~70 | +22 |
| **合计** | **5** | **5** | **~265** | **+27** |

---

## 4. 后端实现方案

### 4.1 知乎 API 参考

> ⚠️ **注意**：以下 API 信息基于知乎开放平台公开文档，实际开发时需以官方最新文档为准。

| 端点 | 方法 | 用途 | 请求头 |
|------|------|------|--------|
| `/api/v4/me` | GET | 验证 API Key + 获取用户信息 | `Authorization: Bearer {apiKey}` |
| `/api/v4/articles` | POST | 发布文章 | `Authorization: Bearer {apiKey}`, `Content-Type: application/json` |
| `/api/v4/answers` | POST | 发布回答 | `Authorization: Bearer {apiKey}`, `Content-Type: application/json` |

**认证响应示例**（`GET /api/v4/me`）：

```json
{
  "id": "abc123def456",
  "name": "张三",
  "url_token": "zhangsan",
  "avatar_url": "https://pic1.zhimg.com/xxx.jpg",
  "headline": "软件工程师"
}
```

**发布请求示例**（`POST /api/v4/articles`）：

```json
{
  "title": "文章标题",
  "content": "# Markdown 内容\n\n支持完整 Markdown 语法",
  "title_image": "https://example.com/cover.jpg",     // 可选
  "canonical_url": "https://example.com/original",     // 可选
  "tags": ["技术", "前端"]                              // 可选，字符串数组
}
```

**发布响应示例**：

```json
{
  "id": 123456,
  "url": "https://zhuanlan.zhihu.com/p/123456",
  "title": "文章标题"
}
```

**错误响应格式**：

```json
{
  "error": {
    "code": 401,
    "message": "无效的 API Key"
  }
}
```

### 4.2 ZhihuProvider 完整接口设计

```typescript
// libraries/nestjs-libraries/src/integrations/social/zhihu.provider.ts

import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { ZhihuSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/zhihu.settings.dto';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';

@Rules(`知乎支持 Markdown 格式发布文章。文章标题必填（≥2字），支持设置规范链接和最多 5 个标签。`)
export class ZhihuProvider extends SocialAbstract implements SocialProvider {
  identifier = 'zhihu';
  name = '知乎';
  isBetweenSteps = false;
  editor = 'markdown' as const;
  scopes = [] as string[];
  oneTimeToken = true;  // API Key 不需要刷新
  dto = ZhihuSettingsDto;

  maxLength() {
    return Infinity;  // 知乎文章无字数上限
  }

  // ─── 认证相关 ───

  /**
   * API Key 模式：generateAuthUrl 返回伪 state，不生成真实 OAuth URL
   */
  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url: state,
      codeVerifier: makeId(10),
      state,
    };
  }

  /**
   * 自定义字段：前端展示 API Key 输入框
   */
  async customFields() {
    return [
      {
        key: 'apiKey',
        label: 'API Key',
        validation: `/^.{3,}$/`,
        type: 'password' as const,
      },
    ];
  }

  /**
   * 认证流程：
   * 1. 解析前端提交的 base64 编码 JSON { apiKey: "xxx" }
   * 2. 用 API Key 调用 GET /api/v4/me 验证
   * 3. 成功 → 返回用户信息 + 伪造 refreshToken（永不过期）
   * 4. 失败 → 返回 'Invalid credentials'
   */
  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body = JSON.parse(Buffer.from(params.code, 'base64').toString());
    try {
      const { id, name, url_token, avatar_url } = await (
        await fetch('https://api.zhihu.com/api/v4/me', {
          headers: {
            Authorization: `Bearer ${body.apiKey}`,
          },
        })
      ).json();

      return {
        refreshToken: '',
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: body.apiKey,
        id,
        name,
        picture: avatar_url || '',
        username: url_token,
      };
    } catch (err) {
      return 'Invalid credentials';
    }
  }

  /**
   * API Key 模式无 refresh
   */
  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  // ─── 发布相关 ───

  /**
   * 发布流程：
   * 1. 从 postDetails[0].settings 获取用户设置（title, tags, canonical）
   * 2. 从 postDetails[0].message 获取 Markdown 正文
   * 3. 调用 POST /api/v4/articles 发布
   * 4. 返回 postId + releaseURL
   */
  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const { settings } = postDetails?.[0] || { settings: {} };
    const { id: postId, url } = await (
      await this.fetch(`https://api.zhihu.com/api/v4/articles`, {
        method: 'POST',
        body: JSON.stringify({
          title: settings.title,
          content: postDetails?.[0].message,
          ...(settings?.canonical
            ? { canonical_url: settings.canonical }
            : {}),
          ...(settings?.tags?.length
            ? { tags: settings.tags.map((t: any) => t.label || t) }
            : {}),
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      })
    ).json();

    return [
      {
        id: postDetails?.[0].id,
        status: 'completed',
        postId: String(postId),
        releaseURL: url,
      },
    ];
  }

  // ─── 错误处理 ───

  /**
   * 知乎错误码映射：
   * - 401: API Key 无效 / token 过期 → refresh-token
   * - 429: 请求过频 → retry
   * - 5xx: 服务器错误 → retry
   * - 其他: bad-body
   */
  override handleErrors(body: string) {
    try {
      const err = JSON.parse(body);
      const code = err.error?.code;

      if (code === 401) {
        return {
          type: 'refresh-token' as const,
          value: 'Token 过期，请重新获取 API Key',
        };
      }
      if (code === 429) {
        return {
          type: 'retry' as const,
          value: '请求过于频繁，请稍后重试',
        };
      }
      if (code && code >= 500) {
        return {
          type: 'retry' as const,
          value: '知乎服务器错误',
        };
      }
    } catch {
      // JSON 格式不匹配，不处理
    }
    return undefined;
  }

  // ─── Tool 装饰器（供 Agent CLI 使用）───
  // 暂时不添加，后续 Phase 5 按需扩展
}
```

### 4.3 DTO 定义

```typescript
// libraries/nestjs-libraries/src/dtos/posts/providers-settings/zhihu.settings.dto.ts

import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ZhihuTagSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/zhihu.tags.settings.dto';
import { Type } from 'class-transformer';

export class ZhihuSettingsDto {
  @IsString()
  @MinLength(2)
  @IsDefined()
  title: string;  // 文章标题，必填，至少 2 字

  @IsOptional()
  @IsString()
  @Matches(/^(https?:\/\/).+/, {
    message: '无效的规范链接 URL',
  })
  canonical?: string;  // 规范链接，可选

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @Type(() => ZhihuTagSettingsDto)
  @ValidateNested({ each: true })
  tags: ZhihuTagSettingsDto[] = [];  // 标签，最多 5 个
}
```

```typescript
// libraries/nestjs-libraries/src/dtos/posts/providers-settings/zhihu.tags.settings.dto.ts

import { IsString, MinLength } from 'class-validator';

export class ZhihuTagSettingsDto {
  @IsString()
  @MinLength(1)
  label: string;
}
```

### 4.4 注册修改

#### integration.manager.ts

在第 8 行（dev.to 导入之后）添加：

```typescript
import { ZhihuProvider } from '@gitroom/nestjs-libraries/integrations/social/zhihu.provider';
```

在 `socialIntegrationList` 数组中添加（按字母顺序，在 `VkProvider` 之后）：

```typescript
new ZhihuProvider(),
```

#### all.providers.settings.ts

在第 16 行（DevToSettingsDto 导入之后）添加：

```typescript
import { ZhihuSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/zhihu.settings.dto';
```

在 `AllProvidersSettings` 类型中添加：

```typescript
| ProviderExtension<'zhihu', ZhihuSettingsDto>
```

在 `allProviders()` 函数中添加：

```typescript
{ value: ZhihuSettingsDto, name: 'zhihu' },
```

#### show.all.providers.tsx

在第 4 行（DevtoProvider 导入之后）添加：

```typescript
import ZhihuProvider from '@gitroom/frontend/components/new-launch/providers/zhihu/zhihu.provider';
```

在 `Providers` 数组中添加：

```typescript
{
  identifier: 'zhihu',
  component: ZhihuProvider,
},
```

---

## 5. 前端实现方案

### 5.1 Provider 组件设计

```tsx
// apps/frontend/src/components/new-launch/providers/zhihu/zhihu.provider.tsx

'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { ZhihuSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/zhihu.settings.dto';
import { Input } from '@gitroom/react/form/input';
import { Canonical } from '@gitroom/react/form/canonical';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';

/**
 * 知乎文章设置表单
 *
 * 字段：
 * - title（必填，≥2字）：文章标题
 * - canonical（可选）：规范链接
 * - tags（预留）：后续 Phase 5 扩展
 */
const ZhihuSettings: FC = () => {
  const form = useSettings();
  const { date } = useIntegration();

  return (
    <>
      <Input label="标题" {...form.register('title')} />
      <Canonical
        date={date}
        label="规范链接"
        {...form.register('canonical')}
      />
    </>
  );
};

export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: ZhihuSettings,
  CustomPreviewComponent: undefined,
  dto: ZhihuSettingsDto,
  maximumCharacters: Infinity,
});
```

### 5.2 表单字段说明

| 字段 | 类型 | 必填 | 说明 | 组件 |
|------|------|------|------|------|
| `title` | string | ✅ 是 | 文章标题，≥2字 | `<Input>` |
| `canonical` | string | 否 | 规范链接（SEO） | `<Canonical>` |
| `tags` | array | 否 | 标签（后续扩展） | 预留 |

### 5.3 连接流程

```
用户操作                   前端                         后端
─────────                 ──────                       ──────
点击"添加知乎" ───────────→                              
                          ↓                             
                  显示 API Key 输入框                     
                          ↓                             
输入 API Key ───────────→                              
                          ↓                             
                  POST /integrations                    
                  {                                     
                    provider: 'zhihu',                  
                    code: base64({apiKey: 'xxx'})        → authenticate()
                                                          ↓
                                                     GET /api/v4/me
                                                     Bearer {apiKey}
                                                          ↓
                                                     ← 返回用户信息
                          ← 显示"已连接：用户名 + 头像"
                          ← API Key 存储为 accessToken
                          ← expiresIn = 100年（永不过期）
```

### 5.4 Icon 图片

**格式**：PNG（256×256，前端会自动缩放）

**位置**：`apps/frontend/public/icons/platforms/zhihu.png`

**来源**：知乎官方品牌资源 → 直接下载矢量 icon 导出 256×256 PNG

**使用方式**：由 `high.order.provider.tsx` 第 310 行自动加载：
```tsx
src={`/icons/platforms/${selectedIntegration?.integration.identifier}.png`}
```
→ 即 `/icons/platforms/zhihu.png`，无需在代码中显式引用。

### 5.5 i18n 翻译键

#### 中文（zh/translation.json）

```json
"connect_zhihu": "连接知乎",
"zhihu_api_key_placeholder": "请输入知乎 API Key",
"zhihu_api_key_help": "从知乎开放平台获取 API Key",
"zhihu_connected": "知乎账号已连接",
"zhihu_title_label": "文章标题",
"zhihu_title_placeholder": "请输入文章标题（至少2个字符）",
"zhihu_canonical_label": "规范链接",
"zhihu_canonical_help": "输入原文链接以声明版权",
"zhihu_tags_label": "文章标签",
"zhihu_tags_max": "最多添加5个标签"
```

#### 英文（en/translation.json）

```json
"connect_zhihu": "Connect Zhihu",
"zhihu_api_key_placeholder": "Enter your Zhihu API Key",
"zhihu_api_key_help": "Get your API key from Zhihu Open Platform",
"zhihu_connected": "Zhihu account connected",
"zhihu_title_label": "Article Title",
"zhihu_title_placeholder": "Enter article title (at least 2 characters)",
"zhihu_canonical_label": "Canonical URL",
"zhihu_canonical_help": "Enter the original URL for copyright attribution",
"zhihu_tags_label": "Tags",
"zhihu_tags_max": "Maximum 5 tags"
```

> **说明**：i18n 键目前主要用于预留。Postiz 现有的连接界面和设置表单多数使用直接中文/英文字符串，i18n 键在后续前端重构时可统一替换。实际开发时可根据现有前端组件中是否使用了 `useT()` 来决定是否直接使用翻译键。

---

## 6. 参考代码分析：dev.to.provider.ts

### 6.1 与知乎的相似度

| 特性 | Dev.to | 知乎 | 差异 |
|------|--------|------|------|
| 认证方式 | API Key | API Key | ✅ 完全相同 |
| 编辑器类型 | markdown | markdown | ✅ 完全相同 |
| scopes | `[]` | `[]` | ✅ 完全相同 |
| oneTimeToken | 未设置（默认 false） | `true` | ⚠️ 知乎设 true（无需刷新） |
| 发布端点 | `/api/articles` | `/api/v4/articles` | 不同 URL |
| 请求头 | `api-key: xxx` | `Authorization: Bearer xxx` | 不同 header 格式 |
| 发布 payload | `article: { title, body_markdown, ... }` | `{ title, content, ... }` | 不同 body 结构 |
| 标签支持 | 工具调用获取 | 直接字符串数组 | 知乎更简单 |
| 组织支持 | 支持 organization_id | 不支持 | 知乎无组织概念 |
| 封面图 | 支持 main_image | 备选（title_image） | 简化处理 |
| 额外工具 | `@Tool tags()`, `@Tool organizations()` | 暂无 | 预留 Phase 5 |

### 6.2 关键模式复用

Dev.to 中的以下模式可直接复用：

1. **`generateAuthUrl()`**：返回伪 state（API Key 认证不需要真实 OAuth URL）
2. **`customFields()`**：返回 API Key 输入框定义，`type: 'password'`
3. **`authenticate()`**：`Buffer.from(params.code, 'base64')` 解析 API Key → fetch 验证 → 返回用户信息
4. **`refreshToken()`**：返回空字段（API Key 不刷新）
5. **expiresIn 计算**：`dayjs().add(100, 'years').unix() - dayjs().unix()` 永不过期
6. **`handleErrors()`**：JSON 解析错误响应 → 按 code 映射

---

## 7. 验证标准

### 7.1 Lint 检查

```bash
# 在项目根目录执行
pnpm lint
```

**预期结果**：零报错，零警告

### 7.2 连接流程测试

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 打开 Postiz → 频道管理 → 添加频道 | 看到"知乎"选项 |
| 2 | 点击"知乎" → 输入有效 API Key | 显示"知乎"＋"输入 API Key"输入框 |
| 3 | 点击"连接" | 调用 `/integrations` API → 触发 `authenticate()` |
| 4 | 连接成功 | 显示用户头像、用户名、已连接状态 |
| 5 | 查看频道列表 | 知乎出现在已连接频道中 |

### 7.3 发布测试

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 创建新帖子 → 选择知乎 | 显示标题输入框 |
| 2 | 输入标题 + Markdown 内容（含粗体、链接、代码块） | 预览正常 |
| 3 | 点击"发布" | Postiz 调用 `post()` |
| 4 | 检查知乎 | 文章成功发布，Markdown 正确渲染 |
| 5 | 检查 Postiz | 帖子状态显示"已完成"，显示 releaseURL |

### 7.4 错误码映射测试

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 用无效 API Key（如 `invalid_key_123`）连接 | 前端显示"Invalid credentials"错误 |
| 2 | 用过期/无效 API Key 发布 | 前端显示"Token 过期"错误信息 |
| 3 | 网络断开时发布 | Postiz 合理处理超时 |

---

## 8. 注意事项与风险

### 8.1 知乎 API 风险

| 风险 | 等级 | 说明 | 缓解措施 |
|------|------|------|---------|
| API 文档不完整 | 🔴 高 | 知乎开放平台可能未公开完整的文章发布 API | Phase 1 先基于公开文档实现，实际测试时调整 |
| API Key 获取门槛 | 🟡 中 | 需要知乎开放平台审核 | 准备测试用 API Key 至少 2 个 |
| 接口变更 | 🟡 中 | 知乎可能调整 API 格式 | `handleErrors()` 覆盖通用错误码 |
| 发布频率限制 | 🟢 低 | 通常 100次/小时足够 | `maxConcurrentJob = 1`（默认）已有保护 |

### 8.2 技术风险

| 风险 | 等级 | 说明 | 缓解措施 |
|------|------|------|---------|
| 知乎 Markdown 变体 | 🟡 中 | 知乎 Markdown 可能有自定义扩展语法 | 先用标准 Markdown 测试，按需调整 |
| tag 格式不确定 | 🟡 中 | 知乎标签可能是 ID 而非字符串 | 先按字符串实现，测试后修正 |
| 401 误判 | 🟢 低 | 知乎可能对非 token 问题也返回 401 | `handleErrors()` 仅捕获明确 code=401 |
| 前端"标题"翻译 | 🟢 低 | "Title" vs "标题" 硬编码 | 已预留 i18n 键 |

### 8.3 已知限制

1. **不支持图片上传**：Phase 1 不实现封面图 `/api/v4/images` 上传（Postiz 媒体库图片可能需要额外处理）
2. **不支持回答模式**：仅支持文章发布，不支持回答提问
3. **不支持草稿**：所有发布直接上线（`published: true`）
4. **不支持定时发布**：依靠 Postiz 的 Temporal 工作流定时
5. **不支持知乎专栏**：无法选择发布到特定专栏

### 8.4 对比 Postiz 现有中国平台支持

| 特性 | VK（俄罗斯） | 知乎（Phase 1） | 
|------|-------------|----------------|
| 认证 | OAuth 2.0 | API Key |
| 前端组件 | 无 SettingsComponent | 有 SettingsComponent（标题+规范链接） |
| DTO | 无（None） | ZhihuSettingsDto |
| 编辑器 | normal | markdown |
| 复杂度 | 极简（15行组件） | 中等（完整表单） |

> VK Provider（`vk.provider.tsx`）是 Postiz 中唯一支持非英文平台的 Provider，可以作为前端组件的另一个参考（极简模式）。

---

## 9. 实施步骤（Checklist）

### Day 1：后端 Provider

- [ ] 创建 `zhihu.provider.ts`（参考 `dev.to.provider.ts`）
- [ ] 创建 `zhihu.settings.dto.ts`
- [ ] 创建 `zhihu.tags.settings.dto.ts`
- [ ] 注册到 `integration.manager.ts`
- [ ] 注册到 `all.providers.settings.ts`
- [ ] `pnpm lint` → 零报错

### Day 2：前端组件 + Icon

- [ ] 创建 `zhihu.provider.tsx`
- [ ] 下载/制作 `zhihu.png` icon（256×256）
- [ ] 注册到 `show.all.providers.tsx`
- [ ] 添加中英文 i18n 翻译键
- [ ] `pnpm lint` → 零报错

### Day 3：联调测试

- [ ] 启动后端 + 前端开发服务器
- [ ] 验证知乎出现在频道列表中
- [ ] 测试连接流程（API Key 输入 → 认证）
- [ ] 测试发布流程（创建帖子 → 发布到知乎）
- [ ] 测试错误码映射（无效 Key、网络错误等）
- [ ] 修复发现的问题

### Day 4-5：缓冲

- [ ] 处理测试中发现的问题
- [ ] 完善错误处理和边界情况
- [ ] 代码审查 + 简化优化
- [ ] 准备 PR

---

## 10. 扩展展望（Phase 2-5）

Phase 1 完成后，后续 Phases 可复用以下经验：

| 复用经验 | 应用于 |
|---------|--------|
| Provider 注册模式 | Phase 2-5 全部 |
| API Key 认证模式 | Phase 2 微博（可选模式） |
| DTO class-validator 模式 | Phase 2-4 全部 |
| `fetch()` + `handleErrors()` 模式 | Phase 2-4 全部 |
| withProvider() HOC 模式 | Phase 2-4 全部 |
| 前端组件模式（Input + Canonical） | Phase 2 微博/小红书 |
| PNG icon 发布流程 | Phase 2-4 全部 |

---

*🦊 知惠 · 牵星工作室 · 2026-06-09*
