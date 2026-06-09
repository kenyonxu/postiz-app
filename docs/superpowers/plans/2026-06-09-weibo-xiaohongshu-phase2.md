# Postiz 微博 + 小红书 Provider — Phase 2 Implementation Plan

> 📅 2026-06-09 · 牵星工作室 · 基于 `docs/china-connectors/roadmap-中国平台Connector实施路线.md` + Phase 1 经验

---

## 目录

1. [目标与范围](#1-目标与范围)
2. [Phase 1→2 可复用经验](#2-phase-1→2-可复用经验)
3. [架构概览](#3-架构概览)
4. [共享逻辑：OAuth 2.0 模式](#4-共享逻辑oauth-20-模式)
5. [微博详细步骤](#5-微博详细步骤)
6. [小红书详细步骤](#6-小红书详细步骤)
7. [完整文件清单](#7-完整文件清单)
8. [依赖关系图](#8-依赖关系图)
9. [预估工作量](#9-预估工作量)
10. [风险评估与缓解](#10-风险评估与缓解)
11. [测试策略](#11-测试策略)
12. [实施步骤 Checklist](#12-实施步骤-checklist)
13. [附录：API 契约参考](#13-附录api-契约参考)

---

## 1. 目标与范围

### 1.1 Phase 2 目标

在 Phase 1 知乎（API Key 认证）走通完整 Provider 链路后，接入两个 OAuth 2.0 认证的中国平台：

```
微博 Provider（OAuth 2.0）  +  小红书 Provider（OAuth 2.0 + note_api 权限）
```

### 1.2 与 Phase 1 的差异

| 维度 | Phase 1 知乎 | Phase 2 微博 | Phase 2 小红书 |
|------|-------------|-------------|---------------|
| 认证模式 | API Key | **OAuth 2.0** | **OAuth 2.0** |
| 参考 Provider | Dev.to (API Key) | **LinkedIn (OAuth)** | **LinkedIn (OAuth)** |
| 需要 refreshToken | ❌ 不需要 (`oneTimeToken=true`) | ✅ 需要 | ✅ 需要 |
| 环境变量 | 无 | `WEIBO_CLIENT_ID`, `WEIBO_CLIENT_SECRET` | `XIAOHONGSHU_CLIENT_ID`, `XIAOHONGSHU_CLIENT_SECRET` |
| 内容限制 | 无限制（Markdown） | 140字 + 9图 | 标题20字 + 正文1000字 + 9图 |
| `checkValidity()` | 默认（未覆写） | 默认（未覆写） | ✅ **需要覆写**（图片必填） |
| 编辑器类型 | `markdown` | `normal` | `normal` |
| 特殊风险 | API 文档不稳定 | **IP 白名单** | **笔记模板严格校验** |

### 1.3 交付物

- [ ] **微博后端**：Provider 类（~250行）+ DTO（~40行）+ 注册（3处）
- [ ] **微博前端**：Provider 组件（~60行）+ Icon PNG + i18n + 注册
- [ ] **小红书后端**：Provider 类（~280行）+ DTO（~50行）+ 注册（3处）
- [ ] **小红书前端**：Provider 组件（~70行）+ Icon PNG + i18n + 注册
- [ ] **环境变量**：4 个新环境变量（微博/小红书 CLIENT_ID + CLIENT_SECRET）
- [ ] `pnpm lint` 零报错
- [ ] 两个平台的 OAuth 连接流程走通
- [ ] 发布测试通过（微博图文、小红书笔记）
- [ ] 错误码映射验证（token 过期、权限不足、IP 白名单等）

---

## 2. Phase 1→2 可复用经验

### 2.1 直接复用的模式

| 模式 | Phase 1（知乎） | Phase 2（微博/小红书） | 复用方式 |
|------|----------------|----------------------|---------|
| Provider 注册 | `integration.manager.ts` +2行 | 同上，各 +2 行 | 复制 import + new 模式 |
| DTO 注册 | `all.providers.settings.ts` +3行 | 同上，各 +3 行 | 复制 union type + entry |
| 前端注册 | `show.all.providers.tsx` +3行 | 同上，各 +3 行 | 复制 import + entry |
| `withProvider()` HOC | 知乎 uses `withProvider({...})` | 同上结构 | 复制组件范式 |
| `fetch()` + `handleErrors()` | 基类提供统一错误处理 | 复用基类 | 无需修改 |
| `class-validator` DTO | `@IsString()`, `@MinLength()` 等 | 同上装饰器 | 直接复用 |
| Icon 放置 | `public/icons/platforms/zhihu.png` | `weibo.png` / `xiaohongshu.png` | 同目录，自动加载 |
| `makeId()` state 生成 | 知乎 API Key 模式 | **OAuth 需要真实 state** | 函数复用，用法不同 |

### 2.2 需要调整的模式

| 模式 | Phase 1 知乎（API Key） | Phase 2 微博/小红书（OAuth） |
|------|------------------------|---------------------------|
| `generateAuthUrl()` | 返回伪 state（不需要真实 OAuth URL） | **返回真实 OAuth 授权 URL**（参考 LinkedIn） |
| `authenticate()` | Base64 解码 API Key → 直接验证 | **OAuth authorization_code 流程**（POST /oauth2/access_token） |
| `refreshToken()` | 返回空字段（永不过期） | **真实 refresh token 交换**（POST /oauth2/access_token + grant_type=refresh_token） |
| `oneTimeToken` | `true`（不触发 refresh） | `false`（默认，需要 refresh） |
| `customFields()` | 返回 API Key 输入框 | **不覆写**（OAuth 不需要自定义字段） |
| `scopes` | `[]` | **需指定真实 scopes** |

### 2.3 关键教训

1. **provider 文件要完整独立**：微博和小红书各自独立文件，不共享 Provider 类（接口相同但平台差异大）
2. **先跑通连接再发内容**：每个平台分两步验证——先确认 OAuth 连接成功拿到 token，再测试发布
3. **环境变量命名规范**：`{PLATFORM}_CLIENT_ID` + `{PLATFORM}_CLIENT_SECRET`（全大写），与现有 LinkedIn 的 `LINKEDIN_CLIENT_ID` 一致
4. **`handleErrors()` 格式依赖**：每个平台的错误 JSON 结构不同，必须按实际 API 返回格式解析
5. **DTO 的 `dto` 属性**：`provider.dto = XXXDto` 用于前端表单校验，不能遗漏

---

## 3. 架构概览

### 3.1 Monorepo 落点

```
postiz-app/
├── libraries/
│   ├── nestjs-libraries/src/
│   │   ├── integrations/
│   │   │   ├── social/
│   │   │   │   ├── weibo.provider.ts               ← 新建：微博 Provider
│   │   │   │   ├── xiaohongshu.provider.ts          ← 新建：小红书 Provider
│   │   │   │   ├── zhihu.provider.ts                ← Phase 1（参考）
│   │   │   │   ├── linkedin.provider.ts             ← 参考：OAuth 模式
│   │   │   │   ├── social.abstract.ts               ← 基类（不修改）
│   │   │   │   └── social.integrations.interface.ts ← 接口（不修改）
│   │   │   └── integration.manager.ts               ← 修改：+2 imports +2 entries
│   │   └── dtos/posts/providers-settings/
│   │       ├── weibo.settings.dto.ts                ← 新建：微博 DTO
│   │       ├── xiaohongshu.settings.dto.ts           ← 新建：小红书 DTO
│   │       └── all.providers.settings.ts            ← 修改：+2 union types +2 entries
│   └── react-shared-libraries/src/translation/locales/
│       ├── zh/translation.json                      ← 修改：+18 中文翻译键
│       └── en/translation.json                      ← 修改：+18 英文翻译键
├── apps/
│   └── frontend/src/
│       ├── components/
│       │   ├── new-launch/providers/
│       │   │   ├── weibo/weibo.provider.tsx          ← 新建：微博前端
│       │   │   ├── xiaohongshu/xiaohongshu.provider.tsx ← 新建：小红书前端
│       │   │   └── show.all.providers.tsx            ← 修改：+2 imports +2 entries
│       │   └── ui/icons/
│       │       └── index.tsx                         ← 可选：SVG Icon 注册
│       └── public/icons/platforms/
│           ├── weibo.png                             ← 新建：微博 Icon（256×256 PNG）
│           └── xiaohongshu.png                       ← 新建：小红书 Icon（256×256 PNG）
└── .env.example                                      ← 修改：+4 环境变量
```

### 3.2 OAuth 2.0 流程对比

```
LinkedIn (参考)                    微博 / 小红书
─────────────                      ──────────────
generateAuthUrl()                  generateAuthUrl()
├─ state = makeId(6)               ├─ state = makeId(6)
├─ codeVerifier = makeId(30)       ├─ codeVerifier = makeId(30)
└─ url = 拼接 OAuth URL            └─ url = 拼接 OAuth URL
                                   └─ 微博: redirect_uri 必须 HTTPS 且在开放平台注册

authenticate()                     authenticate()
├─ POST /oauth/v2/accessToken       ├─ POST /oauth2/access_token
│  grant_type=authorization_code    │  grant_type=authorization_code
│  code, client_id, client_secret   │  code, client_id, client_secret
│  redirect_uri                     │  redirect_uri
├─ 获取 accessToken + refreshToken  ├─  获取 accessToken + uid
└─ checkScopes()                    └─ 小红书: 检查 note_api 权限

refreshToken()                     refreshToken()
├─ POST /oauth/v2/accessToken       ├─ POST /oauth2/access_token
│  grant_type=refresh_token         │  grant_type=refresh_token
│  refresh_token                    │  refresh_token, client_id, client_secret
└─ 返回新 accessToken               └─ 返回新 accessToken + 新 refreshToken
```

---

## 4. 共享逻辑：OAuth 2.0 模式

### 4.1 OAuth 基类模式（不需要抽取，直接使用 SocialAbstract）

微博和小红书**不创建**共享基类。原因：
- 两者都直接 extend `SocialAbstract`（与 LinkedIn 一致）
- `SocialAbstract` 已提供 `fetch()`, `handleErrors()`, `checkScopes()`, `checkValidity()` 等
- 两者的 OAuth 实现细节差异足够大（token URL、响应格式、用户信息端点），抽取共享基类的收益不高

### 4.2 共享的 OAuth 辅助函数（建议提取）

可以提取一个轻量工具函数，但 Phase 2 阶段**不强求**，等 Phase 3（抖音+B站）再统一抽取。

```typescript
// 未来可选: libraries/nestjs-libraries/src/integrations/social/shared/oauth.helpers.ts

/**
 * 标准 OAuth 2.0 authorization_code 流 token 交换
 */
export async function exchangeAuthCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenUrl: string;
}): Promise<{ access_token: string; refresh_token?: string; expires_in: number; uid?: string }> {
  const body = new URLSearchParams();
  body.append('grant_type', 'authorization_code');
  body.append('code', params.code);
  body.append('client_id', params.clientId);
  body.append('client_secret', params.clientSecret);
  body.append('redirect_uri', params.redirectUri);

  const response = await fetch(params.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return response.json();
}

/**
 * 标准 OAuth 2.0 refresh_token 流
 */
export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
}): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const body = new URLSearchParams();
  body.append('grant_type', 'refresh_token');
  body.append('refresh_token', params.refreshToken);
  body.append('client_id', params.clientId);
  body.append('client_secret', params.clientSecret);

  const response = await fetch(params.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return response.json();
}
```

### 4.3 错误处理通用模式

两个平台都遵循 `handleErrors()` 三态映射：

| 返回值 | 含义 | 框架行为 |
|--------|------|---------|
| `{ type: 'refresh-token', value: '...' }` | Token 过期/无效 | `SocialAbstract.fetch()` 抛出 `RefreshToken` → Orchestrator 自动调用 `refreshToken()` |
| `{ type: 'retry', value: '...' }` | 临时错误（频率限制/服务端错误） | `fetch()` 等待 5 秒后重试（最多 3 次） |
| `{ type: 'bad-body', value: '...' }` | 内容问题（格式/权限/业务错误） | `fetch()` 抛出 `BadBody` → 后端返回错误信息给前端 |
| `undefined` | 未匹配 → 默认行为 | 按 HTTP status 处理（401 → refresh-token, 429 → retry, 其他 → bad-body） |

---

## 5. 微博详细步骤

### 5.1 微博 API 概述

| 端点 | 方法 | 用途 | 说明 |
|------|------|------|------|
| `https://api.weibo.com/oauth2/authorize` | GET | OAuth 授权页 | 用户扫码/登录授权 |
| `https://api.weibo.com/oauth2/access_token` | POST | Token 交换/刷新 | `authorization_code` 或 `refresh_token` |
| `https://api.weibo.com/2/users/show.json` | GET | 获取用户信息 | 验证 token + 获取 uid、昵称、头像 |
| `https://api.weibo.com/2/statuses/update.json` | POST | 发布纯文字微博 | ≤140字 |
| `https://api.weibo.com/2/statuses/upload.json` | POST | 发布图文微博 | ≤140字 + pic 参数（multipart） |
| `https://api.weibo.com/2/statuses/upload_url_text.json` | POST | 发布图文（URL方式） | status + url（图片链接） |

### 5.2 步骤 1：OAuth 配置与环境变量

**操作**：在 `.env` / `.env.example` 中添加环境变量

```bash
# 微博 OAuth 2.0
WEIBO_CLIENT_ID=your_app_key
WEIBO_CLIENT_SECRET=your_app_secret
```

**说明**：
- 从 [微博开放平台](https://open.weibo.com/) → 我的应用 → 应用信息 获取 App Key 和 App Secret
- **OAuth 2.0 回调地址**必须设为 `{FRONTEND_URL}/integrations/social/weibo`
- **IP 白名单**：如果应用设置了 IP 白名单，需在开放平台添加服务器出口 IP
- 安全域名需填写 `{FRONTEND_URL}`（不带路径）

### 5.3 步骤 2：WeiboProvider 后端类

**文件**：`libraries/nestjs-libraries/src/integrations/social/weibo.provider.ts`（新建，~250行）

```typescript
import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Integration } from '@prisma/client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { WeiboSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/weibo.settings.dto';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import dayjs from 'dayjs';

@Rules(
  `微博最多 140 字，可含最多 9 张图片（pic_ids 数组）。视频需单独处理（暂不支持）。` +
  `发布前请确认服务器 IP 已加入微博开放平台白名单。`
)
export class WeiboProvider extends SocialAbstract implements SocialProvider {
  identifier = 'weibo';
  name = '微博';
  isBetweenSteps = false;
  editor = 'normal' as const;
  scopes = ['friendships_groups_write', 'statuses_to_me_read'];
  dto = WeiboSettingsDto;
  override maxConcurrentJob = 1; // 微博 API 有频率限制

  maxLength() {
    return 140; // 微博 140 字限制
  }

  // ─── OAuth 认证 ───

  async generateAuthUrl() {
    const state = makeId(6);
    const codeVerifier = makeId(30);
    const url =
      `https://api.weibo.com/oauth2/authorize?` +
      `client_id=${process.env.WEIBO_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(`${process.env.FRONTEND_URL}/integrations/social/weibo`)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(this.scopes.join(','))}&` +
      `state=${state}`;

    return { url, codeVerifier, state };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body = new URLSearchParams();
    body.append('grant_type', 'authorization_code');
    body.append('code', params.code);
    body.append('client_id', process.env.WEIBO_CLIENT_ID!);
    body.append('client_secret', process.env.WEIBO_CLIENT_SECRET!);
    body.append('redirect_uri', `${process.env.FRONTEND_URL}/integrations/social/weibo${
      params.refresh ? `?refresh=${params.refresh}` : ''
    }`);

    const {
      access_token: accessToken,
      expires_in: expiresIn,
      uid,
    } = await (
      await fetch('https://api.weibo.com/oauth2/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    ).json();

    // 获取用户信息
    const {
      screen_name: username,
      name,
      profile_image_url: picture,
    } = await (
      await fetch(`https://api.weibo.com/2/users/show.json?uid=${uid}&access_token=${accessToken}`)
    ).json();

    return {
      id: String(uid),
      accessToken,
      refreshToken: '', // 微博 OAuth 2.0 测试环境可能不返回 refresh_token
      expiresIn,
      name: name || username,
      picture: picture || '',
      username,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const body = new URLSearchParams();
    body.append('grant_type', 'refresh_token');
    body.append('refresh_token', refreshToken);
    body.append('client_id', process.env.WEIBO_CLIENT_ID!);
    body.append('client_secret', process.env.WEIBO_CLIENT_SECRET!);

    const {
      access_token: accessToken,
      expires_in: expiresIn,
      uid,
    } = await (
      await fetch('https://api.weibo.com/oauth2/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    ).json();

    const {
      screen_name: username,
      name,
      profile_image_url: picture,
    } = await (
      await fetch(`https://api.weibo.com/2/users/show.json?uid=${uid}&access_token=${accessToken}`)
    ).json();

    return {
      id: String(uid),
      accessToken,
      refreshToken: '', // 微博可能不返回新 refresh_token
      expiresIn,
      name: name || username,
      picture: picture || '',
      username,
    };
  }

  // ─── 发布 ───

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const message = firstPost.message;

    // 判断是否有图片
    const hasImages = (firstPost.media?.length ?? 0) > 0;

    if (hasImages) {
      // 图文微博：使用 statuses/upload_url_text.json
      // 注意：Postiz 媒体 URL 是 CDN 链接，微博要求图片 URL 可直接访问
      const picUrls = firstPost.media!.map((m) => m.path).join(',');

      const body = new URLSearchParams();
      body.append('access_token', accessToken);
      body.append('status', message);
      body.append('url', picUrls); // 微博要求 url 参数，多个用逗号分隔

      const response = await this.fetch(
        'https://api.weibo.com/2/statuses/upload_url_text.json',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        }
      );
      const data = await response.json();

      return [{
        id: firstPost.id,
        status: 'completed',
        postId: String(data.id),
        releaseURL: `https://weibo.com/${integration.profile}/${data.id}`,
      }];
    } else {
      // 纯文字微博
      const body = new URLSearchParams();
      body.append('access_token', accessToken);
      body.append('status', message);

      const response = await this.fetch(
        'https://api.weibo.com/2/statuses/update.json',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        }
      );
      const data = await response.json();

      return [{
        id: firstPost.id,
        status: 'completed',
        postId: String(data.id),
        releaseURL: `https://weibo.com/${integration.profile}/${data.id}`,
      }];
    }
  }

  // ─── 错误处理 ───

  override handleErrors(body: string) {
    try {
      const err = JSON.parse(body);

      // 微博错误码体系：{ error: "...", error_code: 10001, request: "..." }
      const code = err.error_code;

      // 10006: access_token 无效
      if (code === 10006) {
        return {
          type: 'refresh-token' as const,
          value: '微博 Token 已过期，请重新连接',
        };
      }
      // 10022: IP 白名单限制
      if (code === 10022) {
        return {
          type: 'bad-body' as const,
          value: '服务器 IP 不在微博白名单中，请联系管理员',
        };
      }
      // 10023 / 10024: 频率限制
      if (code === 10023 || code === 10024) {
        return {
          type: 'retry' as const,
          value: '微博 API 请求过频，请稍后重试',
        };
      }
      // 10007 / 10008: 内容违规
      if (code === 10007 || code === 10008) {
        return {
          type: 'bad-body' as const,
          value: '内容不符合微博发布规范',
        };
      }
    } catch {
      // 非 JSON 响应，不处理
    }
    return undefined;
  }
}
```

**关键实现要点**：

| 要点 | 说明 |
|------|------|
| `editor = 'normal'` | 微博不支持 Markdown，纯文本模式 |
| `scopes` | `friendships_groups_write`（发布权限）+ `statuses_to_me_read`（读取权限） |
| OAuth URL 参数 | `response_type=code`, `scope` 用逗号分隔 |
| 用户信息端点 | `GET /2/users/show.json?uid={uid}`，返回 `screen_name`（用户名）和 `profile_image_url`（头像） |
| 发布端点 | 纯文字用 `statuses/update.json`，图文用 `statuses/upload_url_text.json` |
| 图片参数 | `url` 参数，多个图片 URL 用逗号连接（最多 9 张） |
| 错误格式 | `{ error: "...", error_code: 10001, request: "..." }` — 用 `error_code` 字段判断 |
| `refreshToken` 返回空 | 微博测试环境可能不返回 refresh_token，生产环境按需调整 |

### 5.4 步骤 3：WeiboSettingsDto

**文件**：`libraries/nestjs-libraries/src/dtos/posts/providers-settings/weibo.settings.dto.ts`（新建，~40行）

```typescript
import { IsDefined, IsString, MinLength, MaxLength } from 'class-validator';

export class WeiboSettingsDto {
  // 微博 DTO 较为简单：内容限制在 Provider 层处理（maxLength=140），
  // DTO 层暂不需要额外字段。预留扩展字段：
  // - is_long_text: boolean（后续支持长微博）
  // - visible: 'public' | 'friends' | 'private'（可见性）
}
```

> **说明**：微博的 140 字限制在 `maxLength()` 中处理，图片 9 张限制在 `checkValidity()` 中使用基类默认逻辑。DTO 可按需扩展。

### 5.5 步骤 4：后端注册

#### integration.manager.ts（修改 +2行）

在第 9 行（知乎导入之后）添加：

```typescript
import { WeiboProvider } from '@gitroom/nestjs-libraries/integrations/social/weibo.provider';
```

在 `socialIntegrationList` 数组中添加（按字母顺序，在 `VkProvider()` 之后）：

```typescript
new WeiboProvider(),
```

#### all.providers.settings.ts（修改 +3行）

在第 17 行（知乎 DTO 导入之后）添加：

```typescript
import { WeiboSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/weibo.settings.dto';
```

在 `AllProvidersSettings` 类型中添加：

```typescript
| ProviderExtension<'weibo', WeiboSettingsDto>
```

在 `allProviders()` 函数中添加：

```typescript
{ value: WeiboSettingsDto, name: 'weibo' },
```

### 5.6 步骤 5：微博前端组件

**文件**：`apps/frontend/src/components/new-launch/providers/weibo/weibo.provider.tsx`（新建，~60行）

```tsx
'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { WeiboSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/weibo.settings.dto';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/**
 * 微博发布设置
 * 当前仅提供字符计数（140字限制在 maxLength 中处理）
 * 预留：图片预览网格（pic_ids 展示）
 */
const WeiboSettings: FC = () => {
  const { date } = useIntegration();
  const t = useT();

  return (
    <div className="text-sm text-gray-500">
      <p>{t('weibo_char_limit', '微博限制 140 字，最多 9 张图片')}</p>
    </div>
  );
};

export default withProvider({
  postComment: PostComment.NO_COMMENT, // 微博不支持评论功能
  minimumCharacters: [],
  SettingsComponent: WeiboSettings,
  CustomPreviewComponent: undefined,
  dto: WeiboSettingsDto,
  maximumCharacters: 140,
});
```

**关键设计决策**：
- `PostComment.NO_COMMENT`：微博 API 不支持通过第三方发评论
- `SettingsComponent`：当前极简化（仅提示文字），后续 Phase 5 可扩展可见范围等
- `maximumCharacters: 140`：前端会据此显示字符计数和超限警告

### 5.7 步骤 6：Icon 图片

**文件**：`apps/frontend/public/icons/platforms/weibo.png`（新建，二进制）

- **格式**：PNG（256×256，前端会自动缩放到 24×24 显示）
- **来源**：微博官方品牌资源 → 下载矢量 logo → 导出 256×256 PNG
- **使用方式**：由 `high.order.provider.tsx` 自动加载（`/icons/platforms/weibo.png`），无需代码引用

### 5.8 步骤 7：前端注册

#### show.all.providers.tsx（修改 +3行）

在第 4 行（知乎导入之后）添加：

```typescript
import WeiboProvider from '@gitroom/frontend/components/new-launch/providers/weibo/weibo.provider';
```

在 `Providers` 数组中添加：

```typescript
{
  identifier: 'weibo',
  component: WeiboProvider,
},
```

### 5.9 步骤 8：i18n 翻译键

#### 中文（zh/translation.json）新增：

```json
"connect_weibo": "连接微博",
"weibo_connected": "微博账号已连接",
"weibo_char_limit": "微博限制 140 字，最多 9 张图片",
"weibo_ip_whitelist_error": "服务器 IP 不在微博白名单中",
"weibo_content_violation": "内容不符合微博发布规范",
"weibo_rate_limit": "微博 API 请求过频，请稍后重试",
"weibo_token_expired": "微博 Token 已过期，请重新连接"
```

#### 英文（en/translation.json）新增：

```json
"connect_weibo": "Connect Weibo",
"weibo_connected": "Weibo account connected",
"weibo_char_limit": "Weibo limits: 140 characters, maximum 9 images",
"weibo_ip_whitelist_error": "Server IP not in Weibo whitelist",
"weibo_content_violation": "Content violates Weibo posting guidelines",
"weibo_rate_limit": "Weibo API rate limit reached, please retry later",
"weibo_token_expired": "Weibo token expired, please reconnect"
```

---

## 6. 小红书详细步骤

### 6.1 小红书 API 概述

| 端点 | 方法 | 用途 | 说明 |
|------|------|------|------|
| `https://ark.xiaohongshu.com/oauth/authorize` | GET | OAuth 授权页 | 小红书开放平台 OAuth |
| `https://ark.xiaohongshu.com/oauth/access_token` | POST | Token 交换/刷新 | `authorization_code` 或 `refresh_token` |
| `https://ark.xiaohongshu.com/api/open/v1/user/info` | GET | 获取用户信息 | 验证 token + 获取用户数据 |
| `https://ark.xiaohongshu.com/api/open/v1/note/publish` | POST | 发布笔记 | 标题+正文+图片 |

### 6.2 步骤 1：OAuth 配置与环境变量

**操作**：在 `.env` / `.env.example` 中添加环境变量

```bash
# 小红书 OAuth 2.0
XIAOHONGSHU_CLIENT_ID=your_app_id
XIAOHONGSHU_CLIENT_SECRET=your_app_secret
```

**说明**：
- 从小红书开放平台 → 应用管理 → 应用详情 获取 App ID 和 App Secret
- **OAuth 2.0 回调地址**必须设为 `{FRONTEND_URL}/integrations/social/xiaohongshu`
- **必须申请 `note_api` 权限**（笔记发布权限），这是发布笔记的前提
- 应用审核时需提供：应用名称、图标、描述、回调域名

### 6.3 步骤 2：XiaohongshuProvider 后端类

**文件**：`libraries/nestjs-libraries/src/integrations/social/xiaohongshu.provider.ts`（新建，~280行）

```typescript
import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import {
  SocialAbstract,
  ValidityMedia,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Integration } from '@prisma/client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { XiaohongshuSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/xiaohongshu.settings.dto';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

@Rules(
  `小红书笔记模式：标题最多 20 字，正文最多 1000 字，图片最多 9 张。` +
  `笔记必须有至少一张图片（不能纯文字发布）。标题和图片为必填项。`
)
export class XiaohongshuProvider extends SocialAbstract implements SocialProvider {
  identifier = 'xiaohongshu';
  name = '小红书';
  isBetweenSteps = false;
  editor = 'normal' as const;
  scopes = ['note_api']; // 关键权限：笔记发布
  dto = XiaohongshuSettingsDto;
  override maxConcurrentJob = 1;

  maxLength() {
    return 1000; // 小红书正文限制 1000 字
  }

  // ─── checkValidity：笔记模板严格校验 ───

  override async checkValidity(
    posts: Array<ValidityMedia[]>,
    settings: any,
    additionalSettings: any[]
  ): Promise<string | true> {
    const [firstPost, ...restPosts] = posts ?? [];

    // 标题必填校验
    if (!settings?.title || settings.title.length === 0) {
      return '小红书笔记标题不能为空';
    }
    if (settings.title.length > 20) {
      return '小红书笔记标题最多 20 字';
    }

    // 图片必填校验（小红书不支持纯文字笔记）
    if (!firstPost || firstPost.length === 0) {
      return '小红书笔记至少需要一张图片';
    }
    if (firstPost.length > 9) {
      return '小红书笔记最多 9 张图片';
    }

    // 评论不能带媒体
    if (restPosts?.some((p) => (p?.length ?? 0) > 0)) {
      return '小红书评论只能包含纯文字';
    }

    return true;
  }

  // ─── OAuth 认证 ───

  async generateAuthUrl() {
    const state = makeId(6);
    const codeVerifier = makeId(30);
    const url =
      `https://ark.xiaohongshu.com/oauth/authorize?` +
      `client_id=${process.env.XIAOHONGSHU_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(`${process.env.FRONTEND_URL}/integrations/social/xiaohongshu`)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(this.scopes.join(','))}&` +
      `state=${state}`;

    return { url, codeVerifier, state };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body = new URLSearchParams();
    body.append('grant_type', 'authorization_code');
    body.append('code', params.code);
    body.append('client_id', process.env.XIAOHONGSHU_CLIENT_ID!);
    body.append('client_secret', process.env.XIAOHONGSHU_CLIENT_SECRET!);
    body.append('redirect_uri', `${process.env.FRONTEND_URL}/integrations/social/xiaohongshu${
      params.refresh ? `?refresh=${params.refresh}` : ''
    }`);

    const {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      open_id: id,
    } = await (
      await fetch('https://ark.xiaohongshu.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    ).json();

    // checkScopes: 确认拿到了 note_api 权限
    // 小红书 access_token 响应中不直接返回 scope，需通过用户信息接口验证

    // 获取用户信息
    const {
      data: {
        nick_name: name,
        avatar: picture,
        red_id: username,
      },
    } = await (
      await fetch('https://ark.xiaohongshu.com/api/open/v1/user/info', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      })
    ).json();

    return {
      id: String(id),
      accessToken,
      refreshToken: refreshToken || '',
      expiresIn,
      name: name || username || '',
      picture: picture || '',
      username: username || '',
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const body = new URLSearchParams();
    body.append('grant_type', 'refresh_token');
    body.append('refresh_token', refreshToken);
    body.append('client_id', process.env.XIAOHONGSHU_CLIENT_ID!);
    body.append('client_secret', process.env.XIAOHONGSHU_CLIENT_SECRET!);

    const {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      expires_in: expiresIn,
      open_id: id,
    } = await (
      await fetch('https://ark.xiaohongshu.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    ).json();

    // 获取最新用户信息
    const {
      data: {
        nick_name: name,
        avatar: picture,
        red_id: username,
      },
    } = await (
      await fetch('https://ark.xiaohongshu.com/api/open/v1/user/info', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      })
    ).json();

    return {
      id: String(id),
      accessToken,
      refreshToken: newRefreshToken || refreshToken, // 使用新 token（如果有）
      expiresIn,
      name: name || username || '',
      picture: picture || '',
      username: username || '',
    };
  }

  // ─── 发布 ───

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const { settings } = firstPost;
    const message = firstPost.message;
    const images = firstPost.media || [];

    // 构建笔记发布 payload
    const payload: Record<string, any> = {
      title: settings.title,
      content: message,
      image_urls: images.map((m) => m.path), // 小红书接受图片 URL 数组
    };

    const response = await this.fetch(
      'https://ark.xiaohongshu.com/api/open/v1/note/publish',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    // 小红书响应格式：{ success: true, data: { note_id: "...", url: "..." } }
    return [{
      id: firstPost.id,
      status: 'completed',
      postId: data.data?.note_id || '',
      releaseURL: data.data?.url || '',
    }];
  }

  // ─── 错误处理 ───

  override handleErrors(body: string) {
    try {
      const err = JSON.parse(body);

      // 小红书错误格式：{ code: 2100005, success: false, msg: "..." }
      const code = err.code;

      // 2100005: token 过期
      if (code === 2100005) {
        return {
          type: 'refresh-token' as const,
          value: '小红书 Token 已过期，请重新连接',
        };
      }
      // 2100001: 参数错误（bad-body）
      if (code === 2100001) {
        return {
          type: 'bad-body' as const,
          value: err.msg || '小红书请求参数错误',
        };
      }
      // 2100002 / 2100003: 权限不足
      if (code === 2100002 || code === 2100003) {
        return {
          type: 'bad-body' as const,
          value: '应用权限不足，请检查 note_api 权限是否已开通',
        };
      }
      // 2100006: 频率限制
      if (code === 2100006) {
        return {
          type: 'retry' as const,
          value: '小红书 API 请求过频，请稍后重试',
        };
      }
      // 通用错误（code 存在但未匹配）
      if (code) {
        return {
          type: 'bad-body' as const,
          value: err.msg || `小红书返回错误（code: ${code}）`,
        };
      }
    } catch {
      // 非 JSON 响应，不处理
    }
    return undefined;
  }
}
```

**关键实现要点**：

| 要点 | 说明 |
|------|------|
| `scopes = ['note_api']` | **最关键**：没有 note_api 权限无法发布笔记 |
| `checkValidity()` | **必须覆写**：校验标题非空、标题 ≥ 20 字、图片 ≥ 1 张、图片 ≥ 9 张 |
| `editor = 'normal'` | 小红书笔记不支持 Markdown |
| OAuth URL | `ark.xiaohongshu.com` 域名（不是 `open.xiaohongshu.com`） |
| 用户信息端点 | `GET /api/open/v1/user/info`，返回 `nick_name`, `avatar`, `red_id` |
| 发布端点 | `POST /api/open/v1/note/publish`，JSON body（非 form-urlencoded！） |
| 图片参数 | `image_urls` 数组（图片 URL），最多 9 张 |
| 错误格式 | `{ code: 2100005, success: false, msg: "..." }` — 用 `code` 字段判断 |
| `refreshToken` 有返回 | 小红书 OAuth 明确返回 refresh_token，需正确保存 |
| checkScopes | `authenticate()` 中 token 响应不直接返回 scope，需通过用户信息 API 验证权限 |

### 6.4 步骤 3：XiaohongshuSettingsDto

**文件**：`libraries/nestjs-libraries/src/dtos/posts/providers-settings/xiaohongshu.settings.dto.ts`（新建，~50行）

```typescript
import {
  IsDefined,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';

export class XiaohongshuSettingsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @IsDefined()
  title: string; // 笔记标题，必填，1-20字

  // 图片校验在 checkValidity() 中处理（需访问 media 数组），
  // DTO 层只校验标题长度。正文长度在 maxLength() 中处理。
}
```

### 6.5 步骤 4：后端注册

#### integration.manager.ts（修改 +2行）

在第 9 行（知乎导入之后）添加：

```typescript
import { XiaohongshuProvider } from '@gitroom/nestjs-libraries/integrations/social/xiaohongshu.provider';
```

在 `socialIntegrationList` 数组中添加（在 `XProvider()` 之后）：

```typescript
new XiaohongshuProvider(),
```

#### all.providers.settings.ts（修改 +3行）

在第 17 行添加：

```typescript
import { XiaohongshuSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/xiaohongshu.settings.dto';
```

在 `AllProvidersSettings` 类型中添加：

```typescript
| ProviderExtension<'xiaohongshu', XiaohongshuSettingsDto>
```

在 `allProviders()` 函数中添加：

```typescript
{ value: XiaohongshuSettingsDto, name: 'xiaohongshu' },
```

### 6.6 步骤 5：小红书前端组件

**文件**：`apps/frontend/src/components/new-launch/providers/xiaohongshu/xiaohongshu.provider.tsx`（新建，~70行）

```tsx
'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { XiaohongshuSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/xiaohongshu.settings.dto';
import { Input } from '@gitroom/react/form/input';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/**
 * 小红书笔记设置表单
 *
 * 字段：
 * - title（必填，1-20字）：笔记标题
 *
 * 限制由后端 checkValidity() 二次校验：
 * - 图片 ≥ 1 张（必填）
 * - 图片 ≤ 9 张
 * - 正文 ≤ 1000 字
 */
const XiaohongshuSettings: FC = () => {
  const { date } = useIntegration();
  const t = useT();
  const { register, watch } = useSettings();
  const title = watch('title');

  return (
    <div>
      <Input
        label={t('xiaohongshu_title', '笔记标题')}
        placeholder={t('xiaohongshu_title_placeholder', '请输入笔记标题（1-20字）')}
        maxLength={20}
        {...register('title')}
      />
      <div className="text-xs text-gray-400 mt-1">
        {title?.length || 0}/20
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {t('xiaohongshu_note_tips', '小红书笔记要求：至少 1 张图片，正文最多 1000 字')}
      </p>
    </div>
  );
};

export default withProvider({
  postComment: PostComment.NO_COMMENT, // 小红书不支持评论
  minimumCharacters: [],
  SettingsComponent: XiaohongshuSettings,
  CustomPreviewComponent: undefined,
  dto: XiaohongshuSettingsDto,
  maximumCharacters: 1000,
});
```

**关键设计决策**：
- `PostComment.NO_COMMENT`：小红书 API 不支持评论
- `SettingsComponent`：仅标题输入框（标题是必填 DTO 字段），图片由 Postiz 内置媒体管理器处理
- `maximumCharacters: 1000`：前端字符计数
- 标题长度实时显示（x/20）

### 6.7 步骤 6：Icon 图片

**文件**：`apps/frontend/public/icons/platforms/xiaohongshu.png`（新建，二进制）

- **格式**：PNG（256×256）
- **来源**：小红书官方品牌资源 → 导出 256×256 PNG
- **使用方式**：自动加载（`/icons/platforms/xiaohongshu.png`）

### 6.8 步骤 7：前端注册

#### show.all.providers.tsx（修改 +3行）

在第 4 行添加：

```typescript
import XiaohongshuProvider from '@gitroom/frontend/components/new-launch/providers/xiaohongshu/xiaohongshu.provider';
```

在 `Providers` 数组中添加：

```typescript
{
  identifier: 'xiaohongshu',
  component: XiaohongshuProvider,
},
```

### 6.9 步骤 8：i18n 翻译键

#### 中文（zh/translation.json）新增：

```json
"connect_xiaohongshu": "连接小红书",
"xiaohongshu_connected": "小红书账号已连接",
"xiaohongshu_title": "笔记标题",
"xiaohongshu_title_placeholder": "请输入笔记标题（1-20字）",
"xiaohongshu_note_tips": "小红书笔记要求：至少 1 张图片，正文最多 1000 字",
"xiaohongshu_title_required": "笔记标题不能为空",
"xiaohongshu_image_required": "笔记至少需要一张图片",
"xiaohongshu_image_limit": "笔记最多 9 张图片",
"xiaohongshu_token_expired": "小红书 Token 已过期，请重新连接",
"xiaohongshu_permission_denied": "应用权限不足，请检查 note_api 权限"
```

#### 英文（en/translation.json）新增：

```json
"connect_xiaohongshu": "Connect Xiaohongshu",
"xiaohongshu_connected": "Xiaohongshu account connected",
"xiaohongshu_title": "Note Title",
"xiaohongshu_title_placeholder": "Enter note title (1-20 characters)",
"xiaohongshu_note_tips": "Xiaohongshu notes require: at least 1 image, max 1000 characters",
"xiaohongshu_title_required": "Note title cannot be empty",
"xiaohongshu_image_required": "Note requires at least one image",
"xiaohongshu_image_limit": "Maximum 9 images per note",
"xiaohongshu_token_expired": "Xiaohongshu token expired, please reconnect",
"xiaohongshu_permission_denied": "Insufficient permissions, please verify note_api access"
```

---

## 7. 完整文件清单

### 7.1 新建文件（8个）

| # | 文件路径 | 类型 | 预估行数 | 说明 |
|---|---------|------|---------|------|
| 1 | `libraries/nestjs-libraries/src/integrations/social/weibo.provider.ts` | Provider 类 | ~250 | 微博核心发布逻辑 |
| 2 | `libraries/nestjs-libraries/src/dtos/posts/providers-settings/weibo.settings.dto.ts` | DTO 类 | ~40 | 微博设置校验 |
| 3 | `apps/frontend/src/components/new-launch/providers/weibo/weibo.provider.tsx` | 前端组件 | ~60 | 微博设置表单 |
| 4 | `apps/frontend/public/icons/platforms/weibo.png` | 图标文件 | 二进制 | 256×256 PNG |
| 5 | `libraries/nestjs-libraries/src/integrations/social/xiaohongshu.provider.ts` | Provider 类 | ~280 | 小红书核心发布逻辑 |
| 6 | `libraries/nestjs-libraries/src/dtos/posts/providers-settings/xiaohongshu.settings.dto.ts` | DTO 类 | ~50 | 小红书设置校验 |
| 7 | `apps/frontend/src/components/new-launch/providers/xiaohongshu/xiaohongshu.provider.tsx` | 前端组件 | ~70 | 小红书设置表单 |
| 8 | `apps/frontend/public/icons/platforms/xiaohongshu.png` | 图标文件 | 二进制 | 256×256 PNG |

### 7.2 修改文件（7个）

| # | 文件路径 | 修改类型 | 操作 | 预估增加行数 |
|---|---------|---------|------|-------------|
| 9 | `libraries/nestjs-libraries/src/integrations/integration.manager.ts` | 注册 | +2 imports + 2 new entries | +4 |
| 10 | `libraries/nestjs-libraries/src/dtos/posts/providers-settings/all.providers.settings.ts` | 注册 DTO | +2 imports + 2 unions + 2 entries | +6 |
| 11 | `apps/frontend/src/components/new-launch/providers/show.all.providers.tsx` | 注册前端 | +2 imports + 2 entries | +6 |
| 12 | `libraries/react-shared-libraries/src/translation/locales/zh/translation.json` | i18n | +15 中文翻译键 | +15 |
| 13 | `libraries/react-shared-libraries/src/translation/locales/en/translation.json` | i18n | +15 英文翻译键 | +15 |
| 14 | `.env.example` | 环境变量 | +4 变量 + 注释 | +4 |
| 15 | `.env`（实际环境变量文件） | 环境变量 | +4 变量 | +4 |

### 7.3 总览

| 维度 | 新增文件 | 修改文件 | 新增代码行 | 修改代码行 |
|------|---------|---------|-----------|-----------|
| 微博后端 | 2 | 3 | ~290 | +6 |
| 微博前端 | 2 | 3 | ~60 | +21 |
| 小红书后端 | 2 | 3 | ~330 | +6 |
| 小红书前端 | 2 | 3 | ~70 | +21 |
| 共享（环境变量） | 0 | 2 | +8 | 0 |
| **合计** | **8** | **7** | **~758** | **~54** |

---

## 8. 依赖关系图

```
┌─────────────────────────────────────────────────────┐
│                  Phase 1 知乎（已完成）               │
│  - Provider 注册模式                                 │
│  - DTO class-validator 模式                          │
│  - withProvider() HOC 模式                           │
│  - fetch() + handleErrors() 模式                     │
│  - PNG icon 发布流程                                 │
└─────────────┬───────────────────────────────────────┘
              │ 复用
              ▼
┌─────────────────────────────────────────────────────┐
│              LinkedIn Provider（参考）               │
│  - OAuth 2.0 authorization_code 流程                 │
│  - refreshToken() 标准实现                           │
│  - URLSearchParams 构建 token 请求                   │
│  - checkScopes() 权限校验                            │
│  - 用户信息获取后返回 AuthTokenDetails               │
└─────────────┬───────────────────────────────────────┘
              │ 复用
              ▼
┌─────────────────────────────────────────────────────┐
│                 Phase 2 并行开发                      │
│                                                     │
│  微博 ──────────────────────────────────────────►    │
│  │ weibo.provider.ts        (~250行)                │
│  │ weibo.settings.dto.ts    (~40行)                 │
│  │ weibo.provider.tsx       (~60行)                 │
│  │ weibo.png                                        │
│  │                                                  │
│  小红书 ────────────────────────────────────────►    │
│    xiaohongshu.provider.ts    (~280行)              │
│    xiaohongshu.settings.dto.ts (~50行)              │
│    xiaohongshu.provider.tsx    (~70行)              │
│    xiaohongshu.png                                  │
│                                                     │
│  共享注册点（修改同一个文件的不同位置）：              │
│  - integration.manager.ts      +4行                 │
│  - all.providers.settings.ts   +6行                 │
│  - show.all.providers.tsx      +6行                 │
│  - zh/en translation.json      +30行                │
│  - .env.example                +4行                 │
└─────────────────────────────────────────────────────┘
```

**关键依赖**：
- 微博和小红书**可以并行开发**（各自文件独立）
- 注册文件（manager、all providers、show all）需要合并时注意**无冲突**
- **必须先完成的依赖**：`.env` 中的 CLIENT_ID / CLIENT_SECRET（需要从开放平台获取）
- **硬依赖**：Phase 1 知乎已完成（提供注册模式参考）

---

## 9. 预估工作量

### 9.1 微博

| 步骤 | 内容 | 预估代码行 | 预估时间 | 风险等级 |
|------|------|-----------|---------|---------|
| W1 | OAuth 配置 + 环境变量 | 4 | 0.5h | 🟢 低 |
| W2 | WeiboProvider 类 | 250 | 4h | 🟡 中（API 格式确认） |
| W3 | WeiboSettingsDto | 40 | 0.5h | 🟢 低 |
| W4 | 后端注册（3处） | +6 | 0.5h | 🟢 低 |
| W5 | 前端 Provider 组件 | 60 | 1.5h | 🟢 低 |
| W6 | Icon 图片 | 0 | 0.5h | 🟢 低 |
| W7 | 前端注册 + i18n | +21 | 1h | 🟢 低 |
| W8 | OAuth 连接测试 | 0 | 1.5h | 🟡 中（IP白名单） |
| W9 | 发布测试 | 0 | 2h | 🟡 中（API行为验证） |
| W10 | 错误码测试 + 修复 | ~50（调整） | 2h | 🔴 高（错误格式不确定性） |
| **微博小计** | | **~360** | **14h** | |

### 9.2 小红书

| 步骤 | 内容 | 预估代码行 | 预估时间 | 风险等级 |
|------|------|-----------|---------|---------|
| X1 | OAuth 配置 + 环境变量 | 4 | 0.5h | 🟢 低 |
| X2 | XiaohongshuProvider 类 | 280 | 5h | 🔴 高（API 不确定性） |
| X3 | checkValidity() 校验 | (含在X2中) | 1h | 🟡 中（规则细粒度） |
| X4 | XiaohongshuSettingsDto | 50 | 0.5h | 🟢 低 |
| X5 | 后端注册（3处） | +6 | 0.5h | 🟢 低 |
| X6 | 前端 Provider 组件 | 70 | 2h | 🟢 低 |
| X7 | Icon 图片 | 0 | 0.5h | 🟢 低 |
| X8 | 前端注册 + i18n | +21 | 1h | 🟢 低 |
| X9 | OAuth 连接测试 | 0 | 2h | 🟡 中（权限审批） |
| X10 | 发布测试 | 0 | 3h | 🔴 高（模板校验） |
| X11 | checkValidity 测试 + 修复 | ~50（调整） | 2h | 🟡 中 |
| **小红书小计** | | **~430** | **18h** | |

### 9.3 共享操作

| 步骤 | 内容 | 预估时间 |
|------|------|---------|
| S1 | Lint 检查 + 修复 | 1h |
| S2 | 代码审查 + 简化优化 | 2h |
| S3 | 文档更新（CLAUDE.md / roadmap） | 1h |
| S4 | 缓冲（处理测试中发现的问题） | 3h |
| **共享小计** | | **7h** |

### 9.4 总估算

| 类别 | 代码行 | 时间 | 说明 |
|------|--------|------|------|
| 微博 | ~360 | 14h | OAuth 连接 + 发布 + 错误映射 |
| 小红书 | ~430 | 18h | OAuth + checkValidity + 复杂发布 |
| 共享 | ~54（修改） | 7h | Lint + Review + 文档 + 缓冲 |
| **总计** | **~812 新增** | **~39h（~5 工作日）** | 两人并行可压缩到 ~3 天 |

> **并行策略**：微博和小红书的 Provider 类可同时开发（文件独立），但在注册文件（manager / all providers / show all）上可能产生合并冲突。建议一人负责微博 Provider → 另一人负责小红书 Provider → 注册阶段由一人统一处理。

---

## 10. 风险评估与缓解

### 10.1 高风险

| # | 风险 | 等级 | 影响范围 | 具体说明 | 缓解措施 |
|---|------|------|---------|---------|---------|
| R1 | **微博 IP 白名单** | 🔴 高 | 发布失败 | 微博开放平台可能要求配置服务器 IP 白名单，未配置时 API 返回 error_code=10022 | 1. 部署前确认服务器出口 IP<br>2. 在开放平台「应用信息 → 安全设置」添加 IP<br>3. 开发环境使用代理/VPN 固定 IP |
| R2 | **小红书 note_api 权限** | 🔴 高 | 发布失败 | 小红书笔记发布需要审核开通 `note_api` 权限，未开通时 API 返回 2100002/2100003 | 1. 提前提交权限申请（审核时间可能 1-3 天）<br>2. 提供清晰的应用描述和使用场景<br>3. 准备沙箱测试环境（如有） |
| R3 | **小红书 API 不确定性** | 🔴 高 | Provider 整体 | 小红书开放平台 API 文档可能不完整或版本更新，实际响应格式可能与预期不同 | 1. 先使用 curl/Postman 手动验证所有 API<br>2. 记录实际响应格式作为代码注释<br>3. 实现宽泛的错误处理（兜底 `bad-body`） |
| R4 | **发布行为未验证** | 🔴 高 | E2E 测试 | 两个平台都未在 Postiz 中实际发布过，token 获取和发布 API 行为未知 | 1. Phase 2 的第一天用 curl 手动验证整套流程<br>2. 至少准备 2 个测试账号<br>3. 建立一个测试 checklist |

### 10.2 中风险

| # | 风险 | 等级 | 影响范围 | 具体说明 | 缓解措施 |
|---|------|------|---------|---------|---------|
| R5 | **OAuth refresh token 生命周期** | 🟡 中 | Token 刷新 | 微博可能不返回 refresh_token（测试环境），小红书 refresh_token 可能有时效 | 1. `authenticate()` 返回中检查 refreshToken 是否存在<br>2. `refreshToken()` 失败时降级为 `refresh-token` 错误<br>3. 监控 token 过期模式 |
| R6 | **微博 redirect_uri 限制** | 🟡 中 | OAuth 连接 | 微博 OAuth 2.0 回调地址必须精确匹配（包括协议、域名、路径），localhost 可能不被接受 | 1. 使用 FRONTEND_URL 环境变量动态拼接<br>2. 开发环境可能需要 HTTPS（使用 ngrok/cloudflared）<br>3. 在开放平台注册多个回调地址 |
| R7 | **小红书笔记模板校验** | 🟡 中 | 发布失败 | 小红书对笔记格式有严格校验（图片尺寸、内容审核），后端校验不够时可能发布后被拒 | 1. `checkValidity()` 中实现防御性校验<br>2. `handleErrors()` 中捕获内容审核相关错误码<br>3. 错误信息用中文描述（方便运营排查） |
| R8 | **图片 URL 格式兼容** | 🟡 中 | 图片上传 | Postiz 媒体 URL 可能是内部 CDN 链接，微博/小红书要求图片 URL 可公开访问 | 1. 确保 Postiz 媒体 URL 对外可访问<br>2. 如需要，上传前先检查 URL 可达性<br>3. 考虑使用 `upload_url_text` 方式而非原始上传 |

### 10.3 低风险

| # | 风险 | 等级 | 影响范围 | 说明 | 缓解措施 |
|---|------|------|---------|------|---------|
| R9 | 注册文件合并冲突 | 🟢 低 | 开发效率 | 两人同时修改 manager/show all 时产生 git 冲突 | 1. 一人统一处理注册阶段<br>2. 使用独立分支 + rebase |
| R10 | i18n 键遗漏 | 🟢 低 | 前端展示 | 翻译键未覆盖所有 UI 文案 | `pnpm lint` 检查 + 人工审查前端页面 |
| R11 | Icon 尺寸不对 | 🟢 低 | UI 显示 | PNG 尺寸或比例问题 | 使用统一的 256×256 PNG 模板 |

### 10.4 风险缓解总体策略

```
Day 1    ──►  手动 API 验证（curl/Postman）
              ├─ 微博：OAuth → 获取 token → 查看用户信息 → 发布文字 → 发布图文
              └─ 小红书：OAuth → 获取 token → 查看用户信息 → 发布笔记
              如 API 不可用 → 立即调整计划，不进入 Day 2 编码

Day 2-3  ──►  Provider 编码
              按本文档的代码模板进行开发，遇到 API 差异时更新文档

Day 4    ──►  集成测试
              Postiz 全链路测试：连接 → 创建帖子 → 发布 → 检查平台

Day 5    ──►  缓冲 + 修复 + Review
              处理 Day 4 发现的问题 + 代码审查 + PR
```

---

## 11. 测试策略

### 11.1 测试层级

```
┌─────────────────────────────────────────────┐
│ Layer 4: E2E 测试                           │
│ Postiz 前端 → 后端 → 微博/小红书 API → 检查 │
├─────────────────────────────────────────────┤
│ Layer 3: 集成测试                           │
│ Provider 类 → 实际 API（沙箱/测试环境）     │
├─────────────────────────────────────────────┤
│ Layer 2: 单元测试                           │
│ DTO 校验、handleErrors 映射、URL 拼接       │
├─────────────────────────────────────────────┤
│ Layer 1: Lint 测试                          │
│ pnpm lint 零报错                            │
└─────────────────────────────────────────────┘
```

### 11.2 Layer 1: Lint 检查

```bash
# 在项目根目录执行
pnpm lint
```

**预期**：零报错，包括 TypeScript 类型检查、ESLint 规则、Prettier 格式化。

**常见问题**：
- 未使用的 import → 移除
- `any` 类型 → 尽量使用具体类型
- 缺少 return type → 添加 `Promise<AuthTokenDetails>` 等
- `process.env.XXX` 可能 undefined → 使用 `!` 断言（参考 LinkedIn）

### 11.3 Layer 2: DTO 校验单元测试

**微博 DTO 测试**（由于微博 DTO 极简，可通过前端表单手动验证）：
- [ ] 无特殊字段 → 任何 postDetails 都能通过 DTO 校验
- [ ] `maxConcurrentJob = 1` → 并发发布不冲突

**小红书 DTO 测试**：
- [ ] 空标题 → 校验失败（`@MinLength(1)`）
- [ ] 超长标题（21字）→ 校验失败（`@MaxLength(20)`）
- [ ] 恰好 20 字标题 → 校验通过
- [ ] 1 字标题 → 校验通过

### 11.4 Layer 2: handleErrors() 单元测试

**微博错误码映射测试**：

| 输入（body） | 预期 `handleErrors` 返回 | 测试说明 |
|-------------|------------------------|---------|
| `{"error_code": 10006, "error": "access_token expired"}` | `{ type: 'refresh-token' }` | Token 过期 |
| `{"error_code": 10022, "error": "IP whitelist"}` | `{ type: 'bad-body' }` | IP 白名单 |
| `{"error_code": 10023, "error": "rate limit"}` | `{ type: 'retry' }` | 频率限制 |
| `{"error_code": 10007, "error": "content violation"}` | `{ type: 'bad-body' }` | 内容违规 |
| `not json` | `undefined` | 非 JSON 不报错 |
| `{"error_code": 99999}` | `undefined` | 未知错误码不处理 |

**小红书错误码映射测试**：

| 输入（body） | 预期 `handleErrors` 返回 | 测试说明 |
|-------------|------------------------|---------|
| `{"code": 2100005, "success": false, "msg": "token expired"}` | `{ type: 'refresh-token' }` | Token 过期 |
| `{"code": 2100001, "success": false, "msg": "bad params"}` | `{ type: 'bad-body' }` | 参数错误 |
| `{"code": 2100002, "success": false, "msg": "no permission"}` | `{ type: 'bad-body' }` | 权限不足 |
| `{"code": 2100006, "success": false, "msg": "rate limit"}` | `{ type: 'retry' }` | 频率限制 |
| `not json` | `undefined` | 非 JSON 不报错 |

### 11.5 Layer 3: OAuth 连接集成测试

#### 微博 OAuth 连接测试

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 打开 Postiz → 频道管理 → 添加频道 | 看到"微博"选项 |
| 2 | 点击"微博" | 浏览器跳转到 `api.weibo.com/oauth2/authorize` |
| 3 | 登录微博账号并授权 | 微博回调到 `{FRONTEND}/integrations/social/weibo?code=xxx&state=xxx` |
| 4 | Postiz 调用 `authenticate()` | 后端交换 code → access_token → 获取用户信息 |
| 5 | 连接成功 | 前端显示用户头像、昵称、已连接状态 |
| 6 | 查看频道列表 | 微博出现在已连接频道中 |

#### 小红书 OAuth 连接测试

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 打开 Postiz → 频道管理 → 添加频道 | 看到"小红书"选项 |
| 2 | 点击"小红书" | 浏览器跳转到 `ark.xiaohongshu.com/oauth/authorize` |
| 3 | 登录小红书并授权（含 note_api） | 回调到 `{FRONTEND}/integrations/social/xiaohongshu` |
| 4 | Postiz 调用 `authenticate()` | 交换 code → access_token → 获取用户信息 |
| 5 | 连接成功 | 前端显示用户头像、昵称（红书号）、已连接 |
| 6 | 检查 scope | 确认 `note_api` 权限已授予（否则发布会失败） |

### 11.6 Layer 3: 发布集成测试

#### 微博发布测试

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 创建新帖子 → 选择微博 | 字符计数显示 0/140 |
| 2 | 输入文字内容（含 #话题# 和 @提及） | 字符计数更新 |
| 3 | 点击"发布" | Postiz 调用 `post()` |
| 4 | 检查微博 | 微博已发布，内容正确 |
| 5 | 检查 Postiz | 帖子状态"已完成"，显示 releaseURL |
| 6 | 测试超长内容 | 前端阻止发布（maxLength=140） |
| 7 | 测试带图片发布 | 图片正确显示在微博 |
| 8 | 测试错误 Key（无效 token） | 显示"微博 Token 已过期"错误 |

#### 小红书发布测试

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 创建新帖子 → 选择小红书 | 显示标题输入框 + 字符计数 0/1000 |
| 2 | 输入标题（5字） + 正文（200字） + 添加 3 张图片 | 表单正常 |
| 3 | 点击"发布" | Postiz 调用 `post()` |
| 4 | 检查小红书 | 笔记已发布，标题+正文+图片正确 |
| 5 | 测试无标题发布 | `checkValidity` 报错"笔记标题不能为空" |
| 6 | 测试无图片发布 | `checkValidity` 报错"笔记至少需要一张图片" |
| 7 | 测试超长标题（>20字） | `checkValidity` 报错"笔记标题最多 20 字" |
| 8 | 测试 10 张图片 | `checkValidity` 报错"笔记最多 9 张图片" |

### 11.7 Layer 4: 全链路 E2E 测试

#### 流程 1：微博完整发布流程

```
1. 用户登录 Postiz
2. 进入频道管理 → 点击"添加频道" → 选择"微博"
3. 跳转微博 OAuth → 登录 → 授权
4. 回调 Postiz → 显示"微博已连接" ✅
5. 进入内容创作
6. 选择微博频道 → 输入文案 + 添加图片
7. 排程/立即发布
8. Postiz 调用 WeiboProvider.post()
9. 检查微博 → 内容已发布 ✅
10. Postiz 帖子状态 → "已完成" ✅
11. 故意断开连接 → 测试 token 过期错误提示 ✅
```

#### 流程 2：小红书完整发布流程

```
1. 用户登录 Postiz
2. 进入频道管理 → 点击"添加频道" → 选择"小红书"
3. 跳转小红书 OAuth → 登录 → 授权（勾选 note_api）
4. 回调 Postiz → 显示"小红书已连接" ✅
5. 进入内容创作
6. 选择小红书频道 → 输入标题 + 正文 + 添加图片
7. 不带标题点击发布 → 前端提示错误 ✅（checkValidity）
8. 补充标题 → 点击发布
9. Postiz 调用 XiaohongshuProvider.post()
10. 检查小红书 → 笔记已发布 ✅
11. Postiz 帖子状态 → "已完成" ✅
12. 测试各种边界情况（标题长度、图片数量） ✅
```

### 11.8 Token 刷新测试

#### 微博 Token 刷新

- [ ] 使用过期 token 发布 → `handleErrors` 返回 `refresh-token` → Orchestrator 调用 `refreshToken()` → 自动刷新成功
- [ ] 如果微博不返回 refresh_token → `refreshToken()` 返回空 → 前端提示重新连接

#### 小红书 Token 刷新

- [ ] 使用过期 token 发布 → `handleErrors` 返回 `refresh-token`（code=2100005）
- [ ] Orchestrator 调用 `refreshToken()` → 用 refresh_token 获取新 access_token
- [ ] 新 access_token 有效 → 重试发布成功
- [ ] 如果 refresh_token 也过期 → 前端提示重新连接

---

## 12. 实施步骤 Checklist

### Day 1：API 验证 + 环境准备（~6h）

**上午：API 手动验证（3h）**

#### 微博手动验证
- [ ] 从开放平台获取 App Key + App Secret
- [ ] 用 curl 测试 OAuth 2.0 authorization_code 流程
- [ ] 用 curl 测试 `GET /2/users/show.json`
- [ ] 用 curl 测试 `POST /2/statuses/update.json`（纯文字发布）
- [ ] 用 curl 测试 `POST /2/statuses/upload_url_text.json`（图文发布）
- [ ] 记录实际 API 响应格式（与本文档对比，更新差异）
- [ ] 确认 IP 白名单是否已配置

#### 小红书手动验证
- [ ] 从开放平台获取 App ID + App Secret
- [ ] 确认 `note_api` 权限已开通（或提交审核申请）
- [ ] 用 curl 测试 OAuth 2.0 authorization_code 流程
- [ ] 用 curl 测试 `GET /api/open/v1/user/info`
- [ ] 用 curl 测试 `POST /api/open/v1/note/publish`
- [ ] 记录实际 API 响应格式和错误码
- [ ] 确认笔记模板格式要求

**下午：环境变量配置（1h）**
- [ ] 在 `.env` 中添加 4 个环境变量
- [ ] 更新 `.env.example`
- [ ] 重启开发服务器验证新变量生效

**下午：微博 Provider 编码开始（2h）**
- [ ] 创建 `weibo.provider.ts` 骨架（class + 属性）
- [ ] 实现 `generateAuthUrl()` + `authenticate()`
- [ ] 实现 `handleErrors()`
- [ ] 创建 `weibo.settings.dto.ts`

### Day 2：微博编码完成 + 小红书编码开始（~8h）

**全天：微博编码（4h）**
- [ ] 完成 `weibo.provider.ts` 的 `post()` 方法
- [ ] 完成 `weibo.provider.ts` 的 `refreshToken()` 方法
- [ ] 注册：`integration.manager.ts` + `all.providers.settings.ts`
- [ ] 创建 `weibo.provider.tsx` 前端组件
- [ ] 下载/制作 `weibo.png` Icon
- [ ] 注册前端：`show.all.providers.tsx`
- [ ] 添加 i18n 翻译键
- [ ] `pnpm lint` → 零报错

**下午：微博 OAuth 连接测试 + 小红书编码开始（4h）**
- [ ] 测试微博 OAuth 连接流程
- [ ] 修复连接问题（redirect_uri、scope 等）
- [ ] 创建 `xiaohongshu.provider.ts` 骨架
- [ ] 实现 `generateAuthUrl()` + `authenticate()`
- [ ] 实现 `handleErrors()`
- [ ] 创建 `xiaohongshu.settings.dto.ts`

### Day 3：小红书编码完成（~8h）

- [ ] 完成 `xiaohongshu.provider.ts` 的 `post()` 方法
- [ ] 完成 `xiaohongshu.provider.ts` 的 `checkValidity()` 方法
- [ ] 完成 `xiaohongshu.provider.ts` 的 `refreshToken()` 方法
- [ ] 注册：`integration.manager.ts` + `all.providers.settings.ts`
- [ ] 创建 `xiaohongshu.provider.tsx` 前端组件
- [ ] 下载/制作 `xiaohongshu.png` Icon
- [ ] 注册前端：`show.all.providers.tsx`
- [ ] 添加 i18n 翻译键
- [ ] `pnpm lint` → 零报错
- [ ] 测试小红书 OAuth 连接流程
- [ ] 修复连接问题

### Day 4：联调测试 + 发布验证（~8h）

- [ ] **微博全链路测试**：
  - [ ] OAuth 连接 → 断开重连
  - [ ] 纯文字发布
  - [ ] 图文发布
  - [ ] 错误码映射（无效 token、IP 白名单、频率限制）
  - [ ] Token 刷新测试
- [ ] **小红书全链路测试**：
  - [ ] OAuth 连接 → note_api 权限确认
  - [ ] 完整笔记发布（标题+正文+图片）
  - [ ] `checkValidity()` 边界测试（空标题、无图片、超限）
  - [ ] 错误码映射（token 过期、权限不足）
  - [ ] Token 刷新测试
- [ ] 记录所有实际 API 差异并更新代码
- [ ] 修复发现的问题

### Day 5：缓冲 + 完善 + Review（~5h）

- [ ] 处理 Day 4 遗留问题
- [ ] 完善错误处理（添加更多错误码覆盖）
- [ ] 代码审查 + 简化优化
- [ ] 最终 `pnpm lint` 检查
- [ ] 更新 `docs/china-connectors/roadmap-中国平台Connector实施路线.md` 标记 Phase 2 完成
- [ ] 准备 PR 描述（变更摘要 + 测试结果 + 风险说明）
- [ ] PR Review 修改

---

## 13. 附录：API 契约参考

### 13.1 微博 API 契约

#### OAuth 授权 URL

```
GET https://api.weibo.com/oauth2/authorize
  ?client_id={WEIBO_CLIENT_ID}
  &redirect_uri={FRONTEND_URL}/integrations/social/weibo
  &response_type=code
  &scope=friendships_groups_write,statuses_to_me_read
  &state={random_state}
```

#### Token 交换

```
POST https://api.weibo.com/oauth2/access_token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={authorization_code}
&client_id={WEIBO_CLIENT_ID}
&client_secret={WEIBO_CLIENT_SECRET}
&redirect_uri={FRONTEND_URL}/integrations/social/weibo
```

**响应格式**：
```json
{
  "access_token": "2.00xxx",
  "expires_in": 157679999,
  "uid": "1234567890"
}
```

> ⚠️ **注意**：微博测试环境可能不返回 `refresh_token`。

#### 获取用户信息

```
GET https://api.weibo.com/2/users/show.json
  ?uid={uid}
  &access_token={accessToken}
```

**响应格式**：
```json
{
  "id": 1234567890,
  "screen_name": "zhangsan",
  "name": "张三",
  "profile_image_url": "https://tvax1.sinaimg.cn/...",
  "avatar_large": "https://tvax1.sinaimg.cn/...",
  "description": "...",
  "followers_count": 1000,
  "friends_count": 200
}
```

#### 发布纯文字微博

```
POST https://api.weibo.com/2/statuses/update.json
Content-Type: application/x-www-form-urlencoded

access_token={accessToken}
&status={urlEncodedText}
```

**响应格式**：
```json
{
  "id": 1234567890123456,
  "created_at": "Mon Jun 09 12:00:00 +0800 2025",
  "text": "微博内容",
  "user": { "id": 1234567890, "screen_name": "zhangsan" }
}
```

#### 发布图文微博（URL 方式）

```
POST https://api.weibo.com/2/statuses/upload_url_text.json
Content-Type: application/x-www-form-urlencoded

access_token={accessToken}
&status={urlEncodedText}
&url={comma_separated_image_urls}
```

> ⚠️ `url` 参数为图片 URL，多个用逗号分隔，最多 9 张。

### 13.2 小红书 API 契约

#### OAuth 授权 URL

```
GET https://ark.xiaohongshu.com/oauth/authorize
  ?client_id={XIAOHONGSHU_CLIENT_ID}
  &redirect_uri={FRONTEND_URL}/integrations/social/xiaohongshu
  &response_type=code
  &scope=note_api
  &state={random_state}
```

#### Token 交换

```
POST https://ark.xiaohongshu.com/oauth/access_token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={authorization_code}
&client_id={XIAOHONGSHU_CLIENT_ID}
&client_secret={XIAOHONGSHU_CLIENT_SECRET}
&redirect_uri={FRONTEND_URL}/integrations/social/xiaohongshu
```

**响应格式**：
```json
{
  "access_token": "xxx",
  "refresh_token": "yyy",
  "expires_in": 86400,
  "open_id": "abc123"
}
```

> ✅ 小红书明确返回 `refresh_token`，需正确保存。

#### 获取用户信息

```
GET https://ark.xiaohongshu.com/api/open/v1/user/info
Authorization: Bearer {accessToken}
```

**响应格式**：
```json
{
  "code": 0,
  "success": true,
  "msg": "success",
  "data": {
    "open_id": "abc123",
    "nick_name": "小红书用户",
    "avatar": "https://ci.xiaohongshu.com/xxx.jpg",
    "red_id": "user_red_123"
  }
}
```

#### 发布笔记

```
POST https://ark.xiaohongshu.com/api/open/v1/note/publish
Content-Type: application/json
Authorization: Bearer {accessToken}

{
  "title": "笔记标题（≤20字）",
  "content": "笔记正文（≤1000字）",
  "image_urls": [
    "https://example.com/img1.jpg",
    "https://example.com/img2.jpg"
  ]
}
```

**响应格式**：
```json
{
  "code": 0,
  "success": true,
  "msg": "success",
  "data": {
    "note_id": "note_xxx",
    "url": "https://www.xiaohongshu.com/explore/xxx"
  }
}
```

**错误格式**：
```json
{
  "code": 2100005,
  "success": false,
  "msg": "access_token 已过期"
}
```

### 13.3 错误码速查

#### 微博错误码

| error_code | 含义 | handleErrors 映射 |
|-----------|------|------------------|
| 10006 | access_token 无效/过期 | `refresh-token` |
| 10007 | 内容违规 | `bad-body` |
| 10008 | 内容包含禁止关键词 | `bad-body` |
| 10022 | IP 白名单限制 | `bad-body` |
| 10023 | 请求频率超限 | `retry` |
| 10024 | 接口调用频率超限 | `retry` |

#### 小红书错误码

| code | 含义 | handleErrors 映射 |
|------|------|------------------|
| 2100001 | 参数错误 | `bad-body` |
| 2100002 | 权限不足（未开通 API） | `bad-body` |
| 2100003 | 应用无权限（scope 不足） | `bad-body` |
| 2100005 | access_token 过期 | `refresh-token` |
| 2100006 | 请求频率超限 | `retry` |

---

*🦊 知惠 · 牵星工作室 · 2026-06-09*
