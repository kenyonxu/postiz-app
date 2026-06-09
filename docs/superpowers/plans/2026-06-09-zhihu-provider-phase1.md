# 知乎 Provider — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 走通 Postiz 中国平台 Connector 的完整 Provider 开发链路（后端 Provider → DTO → 注册 → 前端组件 → i18n），以知乎 API Key 模式为试点。

**Architecture:** 参考 Dev.to Provider 的同构模式（API Key 认证、Markdown 编辑器），新建 ZhihuProvider 类继承 SocialAbstract 实现 SocialProvider 接口，前端用 withProvider() HOC 挂载设置表单组件。

**Tech Stack:** NestJS 11 + Prisma + React 19 + Vite + TailwindCSS 3 + class-validator + i18next

**Reference:** [spec-phase1-zhihu.md](../../docs/specs/spec-phase1-zhihu.md)

---

## File Map

| # | File | Action | Purpose |
|---|------|--------|---------|
| F1 | `libraries/nestjs-libraries/src/dtos/posts/providers-settings/zhihu.tags.settings.dto.ts` | CREATE | 标签校验 DTO |
| F2 | `libraries/nestjs-libraries/src/dtos/posts/providers-settings/zhihu.settings.dto.ts` | CREATE | 文章设置 DTO |
| F3 | `libraries/nestjs-libraries/src/integrations/social/zhihu.provider.ts` | CREATE | 知乎 Provider 核心类 |
| F4 | `libraries/nestjs-libraries/src/integrations/integration.manager.ts` | MODIFY | 注册 Provider |
| F5 | `libraries/nestjs-libraries/src/dtos/posts/providers-settings/all.providers.settings.ts` | MODIFY | 注册 DTO |
| F6 | `apps/frontend/src/components/new-launch/providers/zhihu/zhihu.provider.tsx` | CREATE | 前端设置表单组件 |
| F7 | `apps/frontend/src/components/new-launch/providers/show.all.providers.tsx` | MODIFY | 注册前端 Provider |
| F8 | `libraries/react-shared-libraries/src/translation/locales/zh/translation.json` | MODIFY | 中文本地化 |
| F9 | `libraries/react-shared-libraries/src/translation/locales/en/translation.json` | MODIFY | 英文本地化 |

---

### Task 1: Create Tag Settings DTO

**Files:**
- Create: `libraries/nestjs-libraries/src/dtos/posts/providers-settings/zhihu.tags.settings.dto.ts`

- [ ] **Step 1: Create the tag DTO file**

```typescript
// libraries/nestjs-libraries/src/dtos/posts/providers-settings/zhihu.tags.settings.dto.ts

import { IsString, MinLength } from 'class-validator';

export class ZhihuTagSettingsDto {
  @IsString()
  @MinLength(1)
  label: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add libraries/nestjs-libraries/src/dtos/posts/providers-settings/zhihu.tags.settings.dto.ts
git commit -m "feat(zhihu): add tag settings DTO"
```

---

### Task 2: Create Article Settings DTO

**Files:**
- Create: `libraries/nestjs-libraries/src/dtos/posts/providers-settings/zhihu.settings.dto.ts`

- [ ] **Step 1: Create the settings DTO file**

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
  title: string;

  @IsOptional()
  @IsString()
  @Matches(/^(https?:\/\/).+/, {
    message: '无效的规范链接 URL',
  })
  canonical?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @Type(() => ZhihuTagSettingsDto)
  @ValidateNested({ each: true })
  tags: ZhihuTagSettingsDto[] = [];
}
```

- [ ] **Step 2: Commit**

```bash
git add libraries/nestjs-libraries/src/dtos/posts/providers-settings/zhihu.settings.dto.ts
git commit -m "feat(zhihu): add article settings DTO"
```

---

### Task 3: Create Zhihu Provider Class

**Files:**
- Create: `libraries/nestjs-libraries/src/integrations/social/zhihu.provider.ts`

- [ ] **Step 1: Create the Provider file**

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

@Rules(
  `知乎支持 Markdown 格式发布文章。文章标题必填（≥2字），支持设置规范链接和最多 5 个标签。`
)
export class ZhihuProvider extends SocialAbstract implements SocialProvider {
  identifier = 'zhihu';
  name = '知乎';
  isBetweenSteps = false;
  editor = 'markdown' as const;
  scopes = [] as string[];
  oneTimeToken = true;
  dto = ZhihuSettingsDto;

  maxLength() {
    return Infinity;
  }

  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url: state,
      codeVerifier: makeId(10),
      state,
    };
  }

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
}
```

- [ ] **Step 2: Commit**

```bash
git add libraries/nestjs-libraries/src/integrations/social/zhihu.provider.ts
git commit -m "feat(zhihu): add ZhihuProvider with API Key auth and article posting"
```

---

### Task 4: Register Provider in IntegrationManager

**Files:**
- Modify: `libraries/nestjs-libraries/src/integrations/integration.manager.ts`

- [ ] **Step 1: Add import after DevToProvider import (line 8)**

In `integration.manager.ts` line 8, after:
```typescript
import { DevToProvider } from '@gitroom/nestjs-libraries/integrations/social/dev.to.provider';
```
add:
```typescript
import { ZhihuProvider } from '@gitroom/nestjs-libraries/integrations/social/zhihu.provider';
```

- [ ] **Step 2: Add provider instance to socialIntegrationList after VkProvider (line 64)**

After `new VkProvider(),` at line 64, add:
```typescript
  new ZhihuProvider(),
```

- [ ] **Step 3: Commit**

```bash
git add libraries/nestjs-libraries/src/integrations/integration.manager.ts
git commit -m "feat(zhihu): register ZhihuProvider in IntegrationManager"
```

---

### Task 5: Register DTO in AllProvidersSettings

**Files:**
- Modify: `libraries/nestjs-libraries/src/dtos/posts/providers-settings/all.providers.settings.ts`

- [ ] **Step 1: Add import after DevToSettingsDto import (line 16)**

After:
```typescript
import { DevToSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/dev.to.settings.dto';
```
add:
```typescript
import { ZhihuSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/zhihu.settings.dto';
```

- [ ] **Step 2: Add to AllProvidersSettings union type before vk (line 59)**

After `| ProviderExtension<'vk', None>` at line 59, add:
```typescript
  | ProviderExtension<'zhihu', ZhihuSettingsDto>
```

- [ ] **Step 3: Add to allProviders() function before devto (line 84)**

Before `{ value: DevToSettingsDto, name: 'devto' },` at line 84, add:
```typescript
    { value: ZhihuSettingsDto, name: 'zhihu' },
```

Note: The allProviders() function is alphabetically sorted by name, and 'zhihu' precedes 'devto' — no. Insert before the devto entry.

- [ ] **Step 4: Commit**

```bash
git add libraries/nestjs-libraries/src/dtos/posts/providers-settings/all.providers.settings.ts
git commit -m "feat(zhihu): register ZhihuSettingsDto in AllProvidersSettings"
```

---

### Task 6: Create Frontend Provider Component

**Files:**
- Create: `apps/frontend/src/components/new-launch/providers/zhihu/zhihu.provider.tsx`

- [ ] **Step 1: Ensure directory exists and create component**

```bash
mkdir -p apps/frontend/src/components/new-launch/providers/zhihu
```

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

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/new-launch/providers/zhihu/zhihu.provider.tsx
git commit -m "feat(zhihu): add frontend provider settings form component"
```

---

### Task 7: Register Frontend Provider in ShowAllProviders

**Files:**
- Modify: `apps/frontend/src/components/new-launch/providers/show.all.providers.tsx`

- [ ] **Step 1: Add import after DevtoProvider import (line 3)**

After:
```typescript
import DevtoProvider from '@gitroom/frontend/components/new-launch/providers/devto/devto.provider';
```
add:
```typescript
import ZhihuProvider from '@gitroom/frontend/components/new-launch/providers/zhihu/zhihu.provider';
```

- [ ] **Step 2: Add provider entry before devto (line 45)**

Before `identifier: 'devto',` at line 45, add:
```typescript
    {
      identifier: 'zhihu',
      component: ZhihuProvider,
    },
```

This keeps alphabetical order in the `Providers` array.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/new-launch/providers/show.all.providers.tsx
git commit -m "feat(zhihu): register frontend provider in ShowAllProviders"
```

---

### Task 8: Add i18n Translation Keys

**Files:**
- Modify: `libraries/react-shared-libraries/src/translation/locales/zh/translation.json`
- Modify: `libraries/react-shared-libraries/src/translation/locales/en/translation.json`

- [ ] **Step 1: Add Chinese translation keys**

In `libraries/react-shared-libraries/src/translation/locales/zh/translation.json`, add the following keys to the root JSON object:

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

- [ ] **Step 2: Add English translation keys**

In `libraries/react-shared-libraries/src/translation/locales/en/translation.json`, add the following keys to the root JSON object:

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

- [ ] **Step 3: Commit**

```bash
git add libraries/react-shared-libraries/src/translation/locales/zh/translation.json libraries/react-shared-libraries/src/translation/locales/en/translation.json
git commit -m "feat(zhihu): add i18n translation keys"
```

---

### Task 9: Run Lint and Verify

**Files:** None new

- [ ] **Step 1: Run lint from project root**

```bash
pnpm lint
```

Expected: Zero errors, zero warnings.

- [ ] **Step 2: Fix any lint errors if present**

Common issues to watch for:
- Unused imports in `zhihu.provider.ts` (TypeScript will flag `id` parameter)
- Missing newline at end of file
- Import ordering in `integration.manager.ts`

- [ ] **Step 3: Commit any lint fixes**

```bash
git add -A
git commit -m "chore(zhihu): fix lint issues"
```

---

### Task 10: Integration Test — Verify Registration

**Files:** None new

- [ ] **Step 1: Start backend dev server**

```bash
pnpm dev-backend
```

Wait for NestJS to start successfully (look for "Nest application successfully started" or similar).

- [ ] **Step 2: Verify provider appears in integrations list**

In a separate terminal:

```bash
curl -s http://localhost:3000/integrations/social | grep -o '"identifier":"zhihu"'
```

Expected: `"identifier":"zhihu"` appears in the response.

If the exact endpoint differs (check the routes), alternatively inspect the NestJS startup log for any provider loading errors.

- [ ] **Step 3: Verify frontend starts without errors**

Start the frontend or check the build:

```bash
cd apps/frontend && npx vite build --mode development 2>&1 | grep -i "error"
```

Expected: No errors related to zhihu files.

- [ ] **Step 4: Commit**

```bash
# Only if test steps revealed issues that needed fixing
git add -A && git commit -m "fix(zhihu): address integration test issues"
```

---

## Summary

| Task | Files | Action |
|------|-------|--------|
| 1 | `zhihu.tags.settings.dto.ts` | CREATE |
| 2 | `zhihu.settings.dto.ts` | CREATE |
| 3 | `zhihu.provider.ts` | CREATE |
| 4 | `integration.manager.ts` | MODIFY (+2 lines) |
| 5 | `all.providers.settings.ts` | MODIFY (+3 lines) |
| 6 | `zhihu/zhihu.provider.tsx` | CREATE |
| 7 | `show.all.providers.tsx` | MODIFY (+5 lines) |
| 8 | `translation.json` × 2 | MODIFY (+10 keys each) |
| 9 | — | LINT |
| 10 | — | TEST |

**Totals:** 5 new files, 5 existing files modified, ~265 new lines, ~27 modified lines, 3-5 day execution.
