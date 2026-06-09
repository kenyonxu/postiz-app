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
          ...(settings?.canonical ? { canonical_url: settings.canonical } : {}),
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
