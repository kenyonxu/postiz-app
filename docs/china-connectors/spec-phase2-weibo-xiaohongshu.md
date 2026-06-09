# Phase 2 技术 Spec：微博 + 小红书 Connector

> 📅 2026-06-09 · 牵星工作室 · 基于 Phase 1 知乎架构 + OAuth 2.0 API 参考

---

## 目录

1. [总览](#1-总览)
2. [OAuth 2.0 共享模式分析](#2-oauth-20-共享模式分析)
3. [微博 Provider 详细设计](#3-微博-provider-详细设计)
4. [小红书 Provider 详细设计](#4-小红书-provider-详细设计)
5. [DTO 定义](#5-dto-定义)
6. [前端组件设计](#6-前端组件设计)
7. [i18n 翻译键](#7-i18n-翻译键)
8. [完整文件清单](#8-完整文件清单)
9. [实施顺序](#9-实施顺序)
10. [验证标准](#10-验证标准)
11. [注意事项与风险](#11-注意事项与风险)

---

## 1. 总览

| 维度 | 微博 | 小红书 |
|------|------|--------|
| 认证方式 | OAuth 2.0 (Authorization Code) | OAuth 2.0 (Authorization Code) |
| `oneTimeToken` | `false`（需 refresh） | `false`（需 refresh） |
| 编辑器类型 | `normal`（纯文本 140 字） | `normal`（标题 ≤20 + 正文 ≤1000） |
| 最大图片数 | 9（九宫格 `pic_ids`） | 9 |
| 视频支持 | 需先 upload API（Phase 2 暂不实现） | 不支持 |
| `checkValidity` | 基础校验 | 严格笔记模板校验 |
| 预估代码量 | ~450 行 | ~400 行 |

---

## 2. OAuth 2.0 共享模式分析

### 2.1 微博和小红书的 OAuth 流程相似性

参考 `linkedin.provider.ts` 的标准 OAuth 2.0 模式：

```
用户点击连接 → generateAuthUrl() 生成授权 URL
  → 用户在平台授权 → 回调 redirect_uri
  → authenticate() 用 code 换取 access_token
  → 返回 AuthTokenDetails
  → 定时 refreshToken() 刷新 token
```

**流程图（通用 OAuth 2.0 模式）：**

```
┌──────────┐    ┌───────────────┐    ┌──────────────┐    ┌───────────┐
│ Postiz   │    │  微博/小红书    │    │   Postiz     │    │  Postiz   │
│ Frontend │    │  OAuth Server │    │  Backend     │    │  Backend  │
└────┬─────┘    └──────┬────────┘    └──────┬───────┘    └─────┬─────┘
     │                  │                   │                   │
     │ 1. 点击连接       │                   │                   │
     │─────────────────────────────────────>│                   │
     │                  │                   │                   │
     │                  │  2. 构建 auth URL │                   │
     │                  │<──────────────────│                   │
     │                  │                   │                   │
     │ 3. 返回 {url, codeVerifier, state}   │                   │
     │<─────────────────────────────────────│                   │
     │                  │                   │                   │
     │ 4. 302 跳转到平台授权页               │                   │
     │─────────────────>│                   │                   │
     │                  │                   │                   │
     │ 5. 用户授权后回调 redirect_uri        │                   │
     │<─────────────────│                   │                   │
     │                  │                   │                   │
     │ 6. 发送 code + codeVerifier          │                   │
     │─────────────────────────────────────>│                   │
     │                  │                   │                   │
     │                  │  7. POST /token   │                   │
     │                  │<──────────────────│                   │
     │                  │  {grant_type: authorization_code,   │
     │                  │   code, client_id, client_secret}   │
     │                  │                   │                   │
     │                  │  8. {access_token, refresh_token,    │
     │                  │      expires_in, uid, ...}           │
     │                  │──────────────────>│                   │
     │                  │                   │                   │
     │ 9. 返回用户信息   │                   │                   │
     │<─────────────────────────────────────│                   │
     │                  │                   │                   │
     │                  │                   │ 10. 定时 refresh  │
     │                  │  11. POST /token  │                   │
     │                  │<──────────────────────────────────────│
     │                  │  grant_type=refresh_token             │
     │                  │                   │                   │
     │                  │  12. 新 access_token                  │
     │                  │──────────────────────────────────────>│
```

### 2.2 与 LinkedIn OAuth 模式的差异

| 项目 | LinkedIn | 微博 | 小红书 |
|------|----------|------|--------|
| Token 端点 | `linkedin.com/oauth/v2/accessToken` | `api.weibo.com/oauth2/access_token` | `openapi.xiaohongshu.com/oauth2/access_token` |
| `redirect_uri` 参数 | `redirect_uri` | `redirect_uri` | `redirect_uri` |
| Token 响应字段 | `access_token`, `refresh_token`, `expires_in` | `access_token`, `expires_in`, `uid` (无独立 refresh_token) | `access_token`, `refresh_token`, `expires_in`, `open_id` |
| 用户信息端点 | `linkedin.com/v2/userinfo` | `api.weibo.com/2/users/show.json` | `openapi.xiaohongshu.com/open/api/getUserInfo` |
| scope 格式 | 空格分隔 | 逗号分隔 | 逗号分隔 |

### 2.3 可抽取的共享逻辑

虽然微博和小红书的 OAuth 流程相似，但考虑到 Postiz 现有架构中每个 Provider 都是独立类，不建议创建 OAuth 基类，而是**直接复用 `SocialAbstract.fetch()` 的 `handleErrors` + `RefreshToken` 机制**。两个 Provider 采用相同的结构模式（参考 LinkedIn），但独立实现各自逻辑。

**共享点：**
- `generateAuthUrl()` 模式：构造 `authorization?response_type=code&client_id=...&redirect_uri=...&scope=...&state=...`
- `authenticate()` 模式：`POST /token` → `checkScopes()` → 获取用户信息 → 返回 `AuthTokenDetails`
- `refreshToken()` 模式：`POST /token` with `grant_type=refresh_token`
- `handleErrors()` 模式：解析 JSON → 匹配错误码 → 返回 `{type, value}`

---

## 3. 微博 Provider 详细设计

### 3.1 微博 API 概览

| 端点 | 方法 | 用途 |
|------|------|------|
| `https://api.weibo.com/oauth2/authorize` | GET | 授权 |
| `https://api.weibo.com/oauth2/access_token` | POST | 换取/刷新 token |
| `https://api.weibo.com/2/users/show.json` | GET | 获取用户信息 |
| `https://api.weibo.com/2/statuses/update.json` | POST | 发文字微博 |
| `https://api.weibo.com/2/statuses/upload.json` | POST | 发图片微博 |
| `https://api.weibo.com/2/statuses/upload_url_text.json` | POST | 发图文混合微博 |

### 3.2 Provider 类骨架

```typescript
// libraries/nestjs-libraries/src/integrations/social/weibo.provider.ts

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
import { WeiboSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/weibo.settings.dto';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { readOrFetch } from '@gitroom/helpers/utils/read.or.fetch';

@Rules(
  `微博最多 140 字，可含最多 9 张图片（九宫格 pic_ids 数组）。` +
  `图片需先通过 upload API 上传获取 media_id，然后传入 statuses/update。` +
  `不支持 Markdown，纯文本模式。`
)
export class WeiboProvider extends SocialAbstract implements SocialProvider {
  identifier = 'weibo';
  name = '微博';
  isBetweenSteps = false;
  editor = 'normal' as const;
  scopes = ['friendships_groups_write', 'statuses_to_me_read'];
  dto = WeiboSettingsDto;
  oneTimeToken = false; // OAuth 2.0，token 有过期时间

  maxLength() {
    return 140; // 微博 140 字限制
  }

  // ========== OAuth 流程 ==========

  async generateAuthUrl() {
    const state = makeId(6);
    const redirectUri =
      `${process.env.FRONTEND_URL}/integrations/social/weibo`;
    const url =
      `https://api.weibo.com/oauth2/authorize` +
      `?response_type=code` +
      `&client_id=${process.env.WEIBO_CLIENT_ID!}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(this.scopes.join(','))}` +
      `&state=${state}`;
    return {
      url,
      codeVerifier: state,
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    // Step 1: 用 code 换 token
    const body = new URLSearchParams();
    body.append('grant_type', 'authorization_code');
    body.append('code', params.code);
    body.append('client_id', process.env.WEIBO_CLIENT_ID!);
    body.append('client_secret', process.env.WEIBO_CLIENT_SECRET!);
    body.append(
      'redirect_uri',
      `${process.env.FRONTEND_URL}/integrations/social/weibo${
        params.refresh ? `?refresh=${params.refresh}` : ''
      }`
    );

    const tokenRes = await (
      await fetch('https://api.weibo.com/oauth2/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    ).json();

    // 微博返回: { access_token, expires_in, uid, ... }
    // 注意: 微博 OAuth2 不返回 refresh_token，access_token 有效期较长（通常 30 天）
    const { access_token, expires_in, uid } = tokenRes;

    // Step 2: 获取用户信息
    const userRes = await (
      await fetch(
        `https://api.weibo.com/2/users/show.json?access_token=${access_token}&uid=${uid}`
      )
    ).json();

    const { screen_name, name, avatar_large } = userRes;

    return {
      id: String(uid),
      accessToken: access_token,
      refreshToken: '', // 微博不提供 refresh_token，过期后需重新授权
      expiresIn: expires_in,
      name: name || screen_name,
      picture: avatar_large || '',
      username: screen_name,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    // 微博使用 password 模式或重新授权获取新 token
    // 由于微博 OAuth2 不提供 refresh_token，这里返回空，让用户重新授权
    return {
      id: '',
      name: '',
      accessToken: '',
      refreshToken: '',
      expiresIn: 0,
      picture: '',
      username: '',
    };
  }

  // ========== 发布逻辑 ==========

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<WeiboSettingsDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const message = firstPost.message.slice(0, 140);

    // 处理图片上传
    let picIds = '';
    if (firstPost.media?.length) {
      const uploadResponses = await Promise.all(
        firstPost.media.slice(0, 9).map(async (media) => {
          const formData = new FormData();
          formData.append('access_token', accessToken);
          formData.append(
            'status',
            message || '分享图片'
          );
          formData.append(
            'pic',
            new Blob([Buffer.from(await readOrFetch(media.path))]),
            'image.jpg'
          );

          const res = await (
            await fetch('https://api.weibo.com/2/statuses/upload.json', {
              method: 'POST',
              body: formData,
            })
          ).json();

          return res?.pic_ids?.[0] || res?.pic_id || '';
        })
      );

      picIds = uploadResponses.filter(Boolean).join(',');

      // 如果有图片，用 upload_url_text 发布（支持 pic_id 参数）
      if (picIds) {
        const urlBody = new URLSearchParams();
        urlBody.append('access_token', accessToken);
        urlBody.append('status', message);
        urlBody.append('pic_id', picIds);

        const final = await (
          await this.fetch('https://api.weibo.com/2/statuses/upload_url_text.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: urlBody,
          })
        ).json();

        return [
          {
            id: firstPost.id,
            status: 'posted',
            postId: String(final.id || ''),
            releaseURL: `https://weibo.com/${id}/${final.id || ''}`,
          },
        ];
      }
    }

    // 纯文字发布
    const textBody = new URLSearchParams();
    textBody.append('access_token', accessToken);
    textBody.append('status', message);

    const final = await (
      await this.fetch('https://api.weibo.com/2/statuses/update.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: textBody,
      })
    ).json();

    return [
      {
        id: firstPost.id,
        status: 'posted',
        postId: String(final.id || ''),
        releaseURL: `https://weibo.com/${id}/${final.id || ''}`,
      },
    ];
  }

  // ========== 错误处理 ==========

  override handleErrors(body: string):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    try {
      const err = JSON.parse(body);

      // 微博错误格式: { error: "...", error_code: 10001 }
      const code = err.error_code;

      // 10006: access_token 无效/过期
      if (code === 10006) {
        return {
          type: 'refresh-token' as const,
          value: '微博授权已过期，请重新连接账号',
        };
      }

      // 10022: IP 白名单限制
      if (code === 10022) {
        return {
          type: 'bad-body' as const,
          value: 'IP 不在白名单中，请在微博开放平台配置服务器 IP',
        };
      }

      // 10023/10024: 请求频率限制
      if (code === 10023 || code === 10024) {
        return {
          type: 'retry' as const,
          value: '微博请求频率限制，稍后自动重试',
        };
      }

      // 20012: 文字内容包含非法词
      if (code === 20012) {
        return {
          type: 'bad-body' as const,
          value: '微博内容包含违规词汇，请修改后重试',
        };
      }

      // 20019: 内容重复
      if (code === 20019) {
        return {
          type: 'bad-body' as const,
          value: '微博内容与最近发布重复，请修改内容',
        };
      }
    } catch {
      // JSON 解析失败，不处理
    }
    return undefined;
  }

  // ========== 内容校验 ==========

  override async checkValidity(
    posts: Array<{ path: string; thumbnail?: string }[]>,
    settings: any,
    additionalSettings: any[]
  ): Promise<string | true> {
    const [firstPost] = posts ?? [];

    // 检查图片数量
    if ((firstPost?.length ?? 0) > 9) {
      return '微博最多支持 9 张图片';
    }

    // 检查是否有视频（微博视频需要单独的 upload API，暂不支持）
    if (firstPost?.some((p) => p.path?.indexOf?.('mp4') ?? -1 > -1)) {
      return '微博视频发布暂未支持（将在后续版本实现）';
    }

    return true;
  }
}
```

### 3.3 关键设计决策

| 决策点 | 选择 | 原因 |
|--------|------|------|
| `oneTimeToken = false` | ✅ | OAuth 2.0 token 有过期时间 |
| refreshToken 返回值 | 返回空 | 微博 OAuth2 不提供 `refresh_token`，过期后需重新授权 |
| 九宫格实现 | 先单张上传 → 拼接 `pic_id` → `upload_url_text` | 微博 API 支持 `pic_id` 参数一次传入多张 |
| 视频支持 | Phase 2 暂不实现 | 需先 `statuses/upload` → 轮询 → 发布，增加复杂度 |
| IP 白名单错误 | 映射到 `bad-body` | 10022 是配置问题，重试无意义 |
| 内容过滤错误 | 映射到 `bad-body` | 20012/20019 需用户修改内容 |

### 3.4 环境变量

```bash
# .env
WEIBO_CLIENT_ID=your_app_key
WEIBO_CLIENT_SECRET=your_app_secret
```

---

## 4. 小红书 Provider 详细设计

### 4.1 小红书 API 概览

| 端点 | 方法 | 用途 |
|------|------|------|
| `https://openapi.xiaohongshu.com/oauth2/authorize` | GET | 授权 |
| `https://openapi.xiaohongshu.com/oauth2/access_token` | POST | 换取/刷新 token |
| `https://openapi.xiaohongshu.com/open/api/getUserInfo` | GET | 获取用户信息 |
| `https://openapi.xiaohongshu.com/note/api` | POST | 发布笔记 |

### 4.2 Provider 类骨架

```typescript
// libraries/nestjs-libraries/src/integrations/social/xiaohongshu.provider.ts

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
import { XiaohongshuSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/xiaohongshu.settings.dto';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { readOrFetch } from '@gitroom/helpers/utils/read.or.fetch';

@Rules(
  `小红书笔记模式：标题最多 20 字、正文最多 1000 字、图片最多 9 张。` +
  `笔记必须包含至少一张图片，不能纯文字发布。` +
  `不支持 Markdown，纯文本模式。`
)
export class XiaohongshuProvider extends SocialAbstract implements SocialProvider {
  identifier = 'xiaohongshu';
  name = '小红书';
  isBetweenSteps = false;
  editor = 'normal' as const;
  scopes = ['note_api']; // 需要 note_api 权限
  dto = XiaohongshuSettingsDto;
  oneTimeToken = false; // OAuth 2.0，token 有过期时间

  maxLength() {
    return 1000; // 正文最大 1000 字
  }

  // ========== OAuth 流程 ==========

  async generateAuthUrl() {
    const state = makeId(6);
    const redirectUri =
      `${process.env.FRONTEND_URL}/integrations/social/xiaohongshu`;
    const url =
      `https://openapi.xiaohongshu.com/oauth2/authorize` +
      `?response_type=code` +
      `&client_id=${process.env.XIAOHONGSHU_CLIENT_ID!}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(this.scopes.join(','))}` +
      `&state=${state}`;
    return {
      url,
      codeVerifier: state,
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    // Step 1: 用 code 换 token
    const body = new URLSearchParams();
    body.append('grant_type', 'authorization_code');
    body.append('code', params.code);
    body.append('client_id', process.env.XIAOHONGSHU_CLIENT_ID!);
    body.append('client_secret', process.env.XIAOHONGSHU_CLIENT_SECRET!);
    body.append(
      'redirect_uri',
      `${process.env.FRONTEND_URL}/integrations/social/xiaohongshu${
        params.refresh ? `?refresh=${params.refresh}` : ''
      }`
    );

    const tokenRes = await (
      await fetch('https://openapi.xiaohongshu.com/oauth2/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    ).json();

    // 小红书返回: { access_token, refresh_token, expires_in, open_id, ... }
    const { access_token, refresh_token, expires_in, open_id } = tokenRes;

    // Step 2: 检查 scope（需要 note_api）
    // 小红书的 scope 在 token 响应中返回
    this.checkScopes(this.scopes, tokenRes.scope || '');

    // Step 3: 获取用户信息
    const userRes = await (
      await fetch(
        `https://openapi.xiaohongshu.com/open/api/getUserInfo?access_token=${access_token}&open_id=${open_id}`,
        {
          headers: { 'Content-Type': 'application/json' },
        }
      )
    ).json();

    // 小红书用户信息格式: { data: { nick_name, avatar, ... }, success: true }
    const { nick_name, avatar } = userRes?.data || {};

    return {
      id: String(open_id),
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      name: nick_name || '',
      picture: avatar || '',
      username: nick_name || '',
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const body = new URLSearchParams();
    body.append('grant_type', 'refresh_token');
    body.append('refresh_token', refreshToken);
    body.append('client_id', process.env.XIAOHONGSHU_CLIENT_ID!);
    body.append('client_secret', process.env.XIAOHONGSHU_CLIENT_SECRET!);

    const tokenRes = await (
      await fetch('https://openapi.xiaohongshu.com/oauth2/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    ).json();

    const { access_token, refresh_token, expires_in, open_id } = tokenRes;

    // 用新 token 获取用户信息
    const userRes = await (
      await fetch(
        `https://openapi.xiaohongshu.com/open/api/getUserInfo?access_token=${access_token}&open_id=${open_id}`,
        { headers: { 'Content-Type': 'application/json' } }
      )
    ).json();

    const { nick_name, avatar } = userRes?.data || {};

    return {
      id: String(open_id),
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      name: nick_name || '',
      picture: avatar || '',
      username: nick_name || '',
    };
  }

  // ========== 发布逻辑 ==========

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<XiaohongshuSettingsDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const settings = firstPost.settings || {};

    // 构建笔记内容
    const noteBody: any = {
      title: (settings.title || '').slice(0, 20),
      content: firstPost.message.slice(0, 1000),
      note_type: 'normal', // 普通笔记
      privacy: 'public',
    };

    // 处理图片上传
    if (firstPost.media?.length) {
      const imageUrls = await Promise.all(
        firstPost.media.slice(0, 9).map(async (media) => {
          // 小红书图片需先上传到小红书 CDN
          const formData = new FormData();
          formData.append(
            'file',
            new Blob([Buffer.from(await readOrFetch(media.path))]),
            'image.jpg'
          );
          formData.append('access_token', accessToken);

          const uploadRes = await (
            await this.fetch(
              'https://openapi.xiaohongshu.com/open/api/uploadImage',
              {
                method: 'POST',
                body: formData,
              }
            )
          ).json();

          return uploadRes?.data?.url || '';
        })
      );

      noteBody.images = imageUrls.filter(Boolean);
    }

    // 调用笔记发布 API
    const final = await (
      await this.fetch('https://openapi.xiaohongshu.com/note/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(noteBody),
      })
    ).json();

    // 小红书返回: { success: true, data: { note_id, ... } }
    const noteId = final?.data?.note_id || '';

    return [
      {
        id: firstPost.id,
        status: 'posted',
        postId: String(noteId),
        releaseURL: noteId
          ? `https://www.xiaohongshu.com/explore/${noteId}`
          : '',
      },
    ];
  }

  // ========== 错误处理 ==========

  override handleErrors(body: string):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    try {
      // 小红书错误格式: { code: 2100005, success: false, msg: "..." }
      const err = JSON.parse(body);
      const code = err.code || err.error_code;

      // 2100005: access_token 过期
      if (code === 2100005) {
        return {
          type: 'refresh-token' as const,
          value: '小红书授权已过期，正在自动刷新...',
        };
      }

      // 2100006: 权限不足
      if (code === 2100006) {
        return {
          type: 'bad-body' as const,
          value: '小红书应用权限不足，请检查 API 权限配置',
        };
      }

      // 2100018: 频率限制
      if (code === 2100018) {
        return {
          type: 'retry' as const,
          value: '小红书请求频率限制，稍后自动重试',
        };
      }

      // 2100011: 内容违规
      if (code === 2100011) {
        return {
          type: 'bad-body' as const,
          value: '小红书内容涉及违规信息，请修改后重试',
        };
      }

      // 2100013: 图片格式/大小不符合要求
      if (code === 2100013) {
        return {
          type: 'bad-body' as const,
          value: '图片格式或大小不符合小红书要求',
        };
      }
    } catch {
      // JSON 解析失败，不处理
    }
    return undefined;
  }

  // ========== 笔记模板校验（严格模式）==========

  override async checkValidity(
    posts: Array<{ path: string; thumbnail?: string }[]>,
    settings: any,
    additionalSettings: any[]
  ): Promise<string | true> {
    const [firstPost, ...restPosts] = posts ?? [];

    // 1. 标题必填
    if (!settings?.title || settings.title.trim().length === 0) {
      return '小红书笔记标题为必填项';
    }

    // 2. 标题最多 20 字
    if ((settings.title || '').length > 20) {
      return '小红书笔记标题最多 20 个字符';
    }

    // 3. 图片必填（不能纯文字发布）
    if (!firstPost?.length) {
      return '小红书笔记必须包含至少一张图片（不支持纯文字发布）';
    }

    // 4. 图片最多 9 张
    if ((firstPost?.length ?? 0) > 9) {
      return '小红书笔记最多支持 9 张图片';
    }

    // 5. 评论不能包含媒体
    if (restPosts?.some((p) => (p?.length ?? 0) > 0)) {
      return '小红书暂不支持带媒体的评论';
    }

    // 6. 不支持视频
    if (firstPost?.some((p) => p.path?.indexOf?.('mp4') ?? -1 > -1)) {
      return '小红书视频笔记暂未支持';
    }

    return true;
  }
}
```

### 4.3 关键设计决策

| 决策点 | 选择 | 原因 |
|--------|------|------|
| `scopes = ['note_api']` | ✅ | note_api 是小黑书笔记发布的核心权限 |
| `checkValidity` 校验 | 严格模式 | 标题 ≤20 字、正文 ≤1000 字、图片 1-9 张、图片必填 |
| 图片上传 | 先上传 CDN → 拿到 URL → 传入 note api | 小红书笔记需要图片 URL，不是 media_id |
| 视频支持 | Phase 2 暂不实现 | 短视频需 video_api 单独申请 |
| `oneTimeToken = false` | ✅ | OAuth 2.0 token 有过期，需 refresh |

### 4.4 环境变量

```bash
# .env
XIAOHONGSHU_CLIENT_ID=your_app_key
XIAOHONGSHU_CLIENT_SECRET=your_app_secret
```

---

## 5. DTO 定义

### 5.1 微博 DTO

```typescript
// libraries/nestjs-libraries/src/dtos/posts/providers-settings/weibo.settings.dto.ts

import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class WeiboSettingsDto {
  @IsOptional()
  @IsBoolean()
  is_long_text?: boolean; // 是否为长文模式（需微博会员或认证用户）
}
```

微博 140 字限制由 Provider 的 `maxLength()` 控制，前端通过 `maximumCharacters` 限制输入。DTO 仅保留平台特有设置。

### 5.2 小红书 DTO

```typescript
// libraries/nestjs-libraries/src/dtos/posts/providers-settings/xiaohongshu.settings.dto.ts

import { IsString, IsDefined, MinLength, MaxLength } from 'class-validator';

export class XiaohongshuSettingsDto {
  @IsString()
  @IsDefined()
  @MinLength(1)
  @MaxLength(20)
  title: string; // 笔记标题（必填，1-20 字）
}
```

---

## 6. 前端组件设计

### 6.1 微博前端 Settings 组件

```typescript
// apps/frontend/src/components/new-launch/providers/weibo/weibo.provider.tsx

'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { WeiboSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/weibo.settings.dto';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';

const WeiboSettings: FC = () => {
  const form = useSettings();
  const { date } = useIntegration();

  // 微博设置较简单，暂无独立设置项
  // 字数限制由 maximumCharacters: 140 控制
  return null;
};

export default withProvider({
  postComment: PostComment.NO_COMMENTS, // 微博暂不支持评论线程
  minimumCharacters: [
    { format: 'no-pictures', type: 'post', maximumCharacters: 1 },
  ],
  SettingsComponent: WeiboSettings,
  CustomPreviewComponent: undefined,
  dto: WeiboSettingsDto,
  maximumCharacters: 140,
});
```

### 6.2 小红书前端 Settings 组件

```typescript
// apps/frontend/src/components/new-launch/providers/xiaohongshu/xiaohongshu.provider.tsx

'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { XiaohongshuSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/xiaohongshu.settings.dto';
import { Input } from '@gitroom/react/form/input';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const XiaohongshuSettings: FC = () => {
  const form = useSettings();
  const t = useT();

  return (
    <>
      <Input
        label={t('xiaohongshu_title_label', '笔记标题')}
        placeholder={t('xiaohongshu_title_placeholder', '请输入笔记标题（1-20字）')}
        maxLength={20}
        {...form.register('title')}
      />
    </>
  );
};

export default withProvider({
  postComment: PostComment.NO_COMMENTS,
  minimumCharacters: [
    { format: 'with-pictures', type: 'post', maximumCharacters: 1 },
  ],
  SettingsComponent: XiaohongshuSettings,
  CustomPreviewComponent: undefined,
  dto: XiaohongshuSettingsDto,
  maximumCharacters: 1000,
});
```

### 6.3 Icon 组件

需要创建两个 SVG 图标组件：

```typescript
// apps/frontend/src/components/ui/icons/weibo-icon.tsx (~20 行)
// apps/frontend/src/components/ui/icons/xiaohongshu-icon.tsx (~20 行)
```

图标需要在 `apps/frontend/src/components/ui/icons/index.tsx` 中导出。

---

## 7. i18n 翻译键

### 7.1 微博翻译键

```jsonc
// zh/translation.json 新增
{
  "connect_weibo": "连接微博",
  "weibo_connected": "微博账号已连接",
  "weibo_max_chars": "微博最多 140 字",
  "weibo_max_images": "微博最多 9 张图片（九宫格）",
  "weibo_error_token": "微博授权已过期，请重新连接账号",
  "weibo_error_ip": "IP 不在白名单中，请在微博开放平台配置服务器 IP",
  "weibo_error_rate": "微博请求频率限制，请稍后重试",
  "weibo_error_content": "微博内容包含违规词汇，请修改后重试",
  "weibo_error_duplicate": "微博内容与最近发布重复",
  "weibo_video_not_supported": "微博视频发布暂未支持"
}
```

```jsonc
// en/translation.json 新增
{
  "connect_weibo": "Connect Weibo",
  "weibo_connected": "Weibo account connected",
  "weibo_max_chars": "Weibo allows up to 140 characters",
  "weibo_max_images": "Weibo allows up to 9 images (grid layout)",
  "weibo_error_token": "Weibo authorization expired, please reconnect",
  "weibo_error_ip": "IP not whitelisted, configure in Weibo Developer Console",
  "weibo_error_rate": "Weibo rate limit exceeded, retrying shortly",
  "weibo_error_content": "Weibo content contains prohibited words",
  "weibo_error_duplicate": "Weibo content duplicates recent posts",
  "weibo_video_not_supported": "Weibo video posting is not yet supported"
}
```

### 7.2 小红书翻译键

```jsonc
// zh/translation.json 新增
{
  "connect_xiaohongshu": "连接小红书",
  "xiaohongshu_connected": "小红书账号已连接",
  "xiaohongshu_title_label": "笔记标题",
  "xiaohongshu_title_placeholder": "请输入笔记标题（1-20字）",
  "xiaohongshu_title_required": "小红书笔记标题为必填项",
  "xiaohongshu_title_max": "标题最多 20 个字符",
  "xiaohongshu_content_max": "笔记正文最多 1000 字",
  "xiaohongshu_image_required": "小红书笔记必须包含至少一张图片",
  "xiaohongshu_max_images": "小红书笔记最多 9 张图片",
  "xiaohongshu_error_token": "小红书授权已过期，正在刷新",
  "xiaohongshu_error_permission": "小红书应用权限不足",
  "xiaohongshu_error_rate": "小红书请求频率限制，请稍后重试",
  "xiaohongshu_error_content": "小红书内容涉及违规信息",
  "xiaohongshu_video_not_supported": "小红书视频笔记暂未支持"
}
```

```jsonc
// en/translation.json 新增
{
  "connect_xiaohongshu": "Connect Xiaohongshu",
  "xiaohongshu_connected": "Xiaohongshu account connected",
  "xiaohongshu_title_label": "Note Title",
  "xiaohongshu_title_placeholder": "Enter note title (1-20 characters)",
  "xiaohongshu_title_required": "Note title is required for Xiaohongshu",
  "xiaohongshu_title_max": "Title must be 20 characters or fewer",
  "xiaohongshu_content_max": "Note body is limited to 1000 characters",
  "xiaohongshu_image_required": "Xiaohongshu notes must have at least one image",
  "xiaohongshu_max_images": "Xiaohongshu notes can have up to 9 images",
  "xiaohongshu_error_token": "Xiaohongshu authorization expired, refreshing",
  "xiaohongshu_error_permission": "Xiaohongshu app permission insufficient",
  "xiaohongshu_error_rate": "Xiaohongshu rate limit exceeded, retrying shortly",
  "xiaohongshu_error_content": "Xiaohongshu content violates platform rules",
  "xiaohongshu_video_not_supported": "Xiaohongshu video notes are not yet supported"
}
```

---

## 8. 完整文件清单

### 8.1 微博文件清单

| 文件 | 操作 | 预估行数 | 说明 |
|------|------|---------|------|
| `libraries/nestjs-libraries/src/integrations/social/weibo.provider.ts` | **新增** | ~250 | Provider 主类：OAuth + 发布 + 校验 |
| `libraries/nestjs-libraries/src/dtos/posts/providers-settings/weibo.settings.dto.ts` | **新增** | ~15 | Settings DTO |
| `libraries/nestjs-libraries/src/integrations/integration.manager.ts` | **修改** | +3 | 导入 + 注册 `WeiboProvider` |
| `libraries/nestjs-libraries/src/dtos/posts/providers-settings/all.providers.settings.ts` | **修改** | +3 | 类型 + `allProviders()` 注册 |
| `apps/frontend/src/components/new-launch/providers/weibo/weibo.provider.tsx` | **新增** | ~45 | 前端 Settings 组件 |
| `apps/frontend/src/components/new-launch/providers/show.all.providers.tsx` | **修改** | +4 | 导入 + `Providers` 数组注册 |
| `apps/frontend/src/components/ui/icons/weibo-icon.tsx` | **新增** | ~20 | 微博 SVG Icon |
| `apps/frontend/src/components/ui/icons/index.tsx` | **修改** | +1 | Icon 导出 |
| `libraries/react-shared-libraries/src/translation/locales/zh/translation.json` | **修改** | +10 | 中文翻译键 |
| `libraries/react-shared-libraries/src/translation/locales/en/translation.json` | **修改** | +10 | 英文翻译键 |

**微博小计：新增 3 文件 (~330 行) + 修改 7 文件 (~34 行)**

### 8.2 小红书文件清单

| 文件 | 操作 | 预估行数 | 说明 |
|------|------|---------|------|
| `libraries/nestjs-libraries/src/integrations/social/xiaohongshu.provider.ts` | **新增** | ~275 | Provider 主类：OAuth + 笔记发布 + 严格校验 |
| `libraries/nestjs-libraries/src/dtos/posts/providers-settings/xiaohongshu.settings.dto.ts` | **新增** | ~20 | Settings DTO（含 title 校验） |
| `libraries/nestjs-libraries/src/integrations/integration.manager.ts` | **修改** | +3 | 导入 + 注册 `XiaohongshuProvider` |
| `libraries/nestjs-libraries/src/dtos/posts/providers-settings/all.providers.settings.ts` | **修改** | +3 | 类型 + `allProviders()` 注册 |
| `apps/frontend/src/components/new-launch/providers/xiaohongshu/xiaohongshu.provider.tsx` | **新增** | ~55 | 前端 Settings 组件（含 title 输入） |
| `apps/frontend/src/components/new-launch/providers/show.all.providers.tsx` | **修改** | +4 | 导入 + `Providers` 数组注册 |
| `apps/frontend/src/components/ui/icons/xiaohongshu-icon.tsx` | **新增** | ~20 | 小红书 SVG Icon |
| `apps/frontend/src/components/ui/icons/index.tsx` | **修改** | +1 | Icon 导出 |
| `libraries/react-shared-libraries/src/translation/locales/zh/translation.json` | **修改** | +14 | 中文翻译键 |
| `libraries/react-shared-libraries/src/translation/locales/en/translation.json` | **修改** | +14 | 英文翻译键 |

**小红书小计：新增 4 文件 (~370 行) + 修改 6 文件 (~39 行)**

### 8.3 汇总

| 类别 | 微博 | 小红书 | 合计 |
|------|------|--------|------|
| 新增 Provider | `weibo.provider.ts` (~250) | `xiaohongshu.provider.ts` (~275) | 2 文件 (~525) |
| 新增 DTO | `weibo.settings.dto.ts` (~15) | `xiaohongshu.settings.dto.ts` (~20) | 2 文件 (~35) |
| 新增前端组件 | `weibo.provider.tsx` (~45) | `xiaohongshu.provider.tsx` (~55) | 2 文件 (~100) |
| 新增 Icon | `weibo-icon.tsx` (~20) | `xiaohongshu-icon.tsx` (~20) | 2 文件 (~40) |
| 修改注册文件 | 4 处 | 4 处 | 8 处 (~57) |
| 修改 i18n | 2 文件 (+20) | 2 文件 (+28) | 4 文件 (+48) |
| **总计** | | | **新增 8 文件 (~700 行) + 修改 8 文件 (~105 行)** |

---

## 9. 实施顺序

### 9.1 推荐顺序

由于微博和小红书共享 OAuth 2.0 模式，建议先完成微博（结构更接近 LinkedIn），验证 OAuth 流程后再做小红书。

```
Day 1-2: 微博 Provider 开发
  1. 创建 weibo.settings.dto.ts
  2. 创建 weibo.provider.ts（generateAuthUrl + authenticate + refreshToken）
  3. 注册到 integration.manager.ts + all.providers.settings.ts
  4. 创建 weibo.provider.tsx（前端）
  5. 创建 weibo-icon.tsx
  6. 注册到 show.all.providers.tsx + icons/index.tsx
  7. 添加 i18n 键
  8. pnpm lint → 测试 OAuth 流程

Day 3-4: 微博发布 + 错误处理
  9. 实现 post() 方法（文字 + 图片）
  10. 实现 handleErrors() 映射
  11. 实现 checkValidity()
  12. 发布测试

Day 5-6: 小红书 Provider 开发
  13. 创建 xiaohongshu.settings.dto.ts
  14. 创建 xiaohongshu.provider.ts
  15. 注册到各文件
  16. 创建前端 + Icon + i18n
  17. pnpm lint

Day 7-8: 小红书发布 + 校验
  18. 实现 post()（图片上传 + 笔记发布）
  19. 实现 checkValidity()（严格校验）
  20. 实现 handleErrors()
  21. 发布测试

Day 9-10: 联调 + Lint + 文档
  22. pnpm lint 零报错验证
  23. 端到端测试两个平台
  24. 更新 roadmap 文档状态
```

### 9.2 可并行部分

- 微博和小红书的 **DTO** 可提前一起编写
- 微博和小红书的 **Icon** 可同时创建
- 微博和小红书的 **i18n 翻译键** 可一次添加完
- Provider 主类建议串行（先验证微博 OAuth 流程，小红书可直接复用模式）

---

## 10. 验证标准

### 10.1 通用验证

- [ ] `pnpm lint` 零报错（从项目根目录运行）
- [ ] TypeScript 编译无报错
- [ ] 前端 Channel 选择页面出现微博 + 小红书选项
- [ ] 两个 Icon 正确渲染

### 10.2 微博验证

- [ ] OAuth 2.0 连接：用户点击 → 跳转微博授权页 → 授权 → 回调 → 显示已连接
- [ ] 纯文字发布（≤140 字）成功，返回 `postId` + `releaseURL`
- [ ] 单张图片发布成功，`pic_id` 正确传递
- [ ] 多张图片（九宫格）发布成功，`pic_ids` 逗号拼接正确
- [ ] `handleErrors`：10006 返回 `refresh-token`
- [ ] `handleErrors`：10022 返回 `bad-body`
- [ ] `handleErrors`：10023/10024 返回 `retry`
- [ ] `checkValidity`：超过 9 张图片 → 返回错误信息
- [ ] `checkValidity`：包含视频 → 返回不支持信息
- [ ] 超过 140 字时前端字符计数器正确截断

### 10.3 小红书验证

- [ ] OAuth 2.0 连接（含 `note_api` 权限）成功
- [ ] 笔记发布（标题 + 图片 + 正文）成功，返回 `noteId` + `releaseURL`
- [ ] `checkValidity`：无标题 → 返回 "标题为必填项"
- [ ] `checkValidity`：标题超过 20 字 → 返回错误
- [ ] `checkValidity`：无图片 → 返回 "必须包含至少一张图片"
- [ ] `checkValidity`：超过 9 张图片 → 返回错误
- [ ] `checkValidity`：body 超过 1000 字 → 前端截断（由 `maximumCharacters` 控制）
- [ ] `checkValidity`：包含视频 → 返回不支持信息
- [ ] `handleErrors`：2100005 返回 `refresh-token`（触发自动刷新）
- [ ] `handleErrors`：2100006 返回 `bad-body`
- [ ] `handleErrors`：2100018 返回 `retry`
- [ ] Token 过期后 `refreshToken()` 成功获取新 token

### 10.4 非破坏性验证

- [ ] 已有 Provider（X、LinkedIn、知乎等）功能不受影响
- [ ] 已有国际化翻译键不被覆盖
- [ ] 已有 integration 数据不受影响

---

## 11. 注意事项与风险

### 11.1 微博特殊注意事项

1. **IP 白名单**：微博开放平台要求配置服务器 IP 白名单。作为 SaaS 产品（Postiz 可自部署），需在文档中提醒用户配置。
2. **无 refresh_token**：微博 OAuth2 不返回 `refresh_token`，`refreshToken()` 应返回空值，并提示用户需重新授权。或者不使用 `oneTimeToken`，依赖 `expiresIn` 到期前前端提示重连。
3. **九宫格实现顺序**：微博的 `statuses/upload.json` 一次只能上传一张图片并发布一条微博。所以要发多图：（a）先多次调用 `upload` 获取各 `pic_id`；（b）用逗号拼接；（c）调用 `upload_url_text`。
4. **140 字严格限制**：中文字符也算一字，URL 会自动缩短。`maxLength()` 必须返回 140。
5. **长文模式**：微博认证/会员用户可发 2000+ 字长文。Phase 2 暂不处理此场景，可在后续 DTO 中加 `is_long_text` 开关扩展。
6. **审核机制**：微博内容会经过平台审核，发布状态可能不是立即 `posted`，可能需要轮询。

### 11.2 小红书特殊注意事项

1. **应用审核**：小红书开放平台需要提交应用审核，`note_api` 权限需要额外申请。无此权限的 OAuth 流程可能会批准但发布时失败。
2. **笔记模板严格**：标题 1-20 字、正文 ≤1000 字、图片 1-9 张，任一不满足则 API 拒绝。`checkValidity()` 的严格模式是在 API 调用前捕获这些问题。
3. **图片必填**：小红书不支持纯文字笔记。前端应在用户选择小红书后显示此提示。
4. **图片大小限制**：小红书对图片有大小和格式限制（建议 JPG/PNG，≤20MB），实际 API 可能有更严格控制。
5. **审核机制**：笔记发布后进入平台审核，审核中状态可能需轮询确认。
6. **refreshToken**：小红书 `refresh_token` 有效期通常 30 天。过期后需用户重新授权。
7. **API 版本**：小红书开放 API 可能有版本迭代，需要关注 breaking changes。

### 11.3 通用风险

1. **API 变动**：微博和小红书 API 可能升级或改动。建议在代码注释中标注 API 文档链接和最后更新日期。
2. **OAuth 回调 URL**：确保 `FRONTEND_URL` 环境变量正确配置，且回调路由 `/integrations/social/weibo` 和 `/integrations/social/xiaohongshu` 在 Postiz 前端路由中存在。
3. **测试环境**：微博和小红书以测试环境调试为目的，建议创建测试 App 而非生产 App。
4. **数据库无需迁移**：Provider 注册是内存操作，不涉及 Prisma schema 变更。
5. **Postiz 核心表不变**：新增 Provider 仅增加 `integration.manager.ts` 的数组元素，不改变 integration 表结构。

---

## 附录：与 Phase 1 知乎的比较

| 维度 | 知乎 (Phase 1) | 微博 (Phase 2) | 小红书 (Phase 2) |
|------|---------------|----------------|------------------|
| 认证 | API Key（简单） | OAuth 2.0 | OAuth 2.0 |
| `oneTimeToken` | `true` | `false` | `false` |
| `scopes` | `[]` | `['friendships_groups_write', 'statuses_to_me_read']` | `['note_api']` |
| `editor` | `markdown` | `normal` | `normal` |
| `maxLength` | `Infinity` | `140` | `1000` |
| `customFields` | API Key 输入 | 无 | 无 |
| `checkValidity` | 无 | 图片 ≤9 | 标题必填/≤20字/图片 1-9张 |
| 前端 Settings | `Input(title)` + `Canonical` | ~无 | `Input(title)` |
| 复杂度 | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

---

*🦊 知惠 · 牵星工作室 · 2026-06-09*
