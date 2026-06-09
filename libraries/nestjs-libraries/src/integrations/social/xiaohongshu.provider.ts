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
import { readOrFetch } from '@gitroom/helpers/utils/read.or.fetch';

@Rules(
  `小红书笔记模式：标题最多 20 字、正文最多 1000 字、图片最多 9 张。` +
    `笔记必须包含至少一张图片，不能纯文字发布。` +
    `不支持 Markdown，纯文本模式。`
)
export class XiaohongshuProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'xiaohongshu';
  name = '小红书';
  isBetweenSteps = false;
  editor = 'normal' as const;
  scopes = ['note_api'];
  dto = XiaohongshuSettingsDto;
  oneTimeToken = false;
  override maxConcurrentJob = 1;

  maxLength() {
    return 1000;
  }

  // ========== 笔记模板校验（严格模式）==========

  override async checkValidity(
    posts: Array<ValidityMedia[]>,
    settings: any,
    _additionalSettings: any[]
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
    if (firstPost?.some((p) => (p.path?.indexOf?.('mp4') ?? -1) > -1)) {
      return '小红书视频笔记暂未支持';
    }

    return true;
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
      await fetch(
        'https://openapi.xiaohongshu.com/oauth2/access_token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        }
      )
    ).json();

    const { access_token, refresh_token, expires_in, open_id } = tokenRes;

    this.checkScopes(this.scopes, tokenRes.scope || '');

    const userRes = await (
      await fetch(
        `https://openapi.xiaohongshu.com/open/api/getUserInfo?access_token=${access_token}&open_id=${open_id}`,
        {
          headers: { 'Content-Type': 'application/json' },
        }
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

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const body = new URLSearchParams();
    body.append('grant_type', 'refresh_token');
    body.append('refresh_token', refreshToken);
    body.append('client_id', process.env.XIAOHONGSHU_CLIENT_ID!);
    body.append('client_secret', process.env.XIAOHONGSHU_CLIENT_SECRET!);

    const tokenRes = await (
      await fetch(
        'https://openapi.xiaohongshu.com/oauth2/access_token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        }
      )
    ).json();

    const { access_token, refresh_token, expires_in, open_id } = tokenRes;

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
    const settings = (firstPost.settings || {}) as XiaohongshuSettingsDto;

    const noteBody: any = {
      title: (settings.title || '').slice(0, 20),
      content: firstPost.message.slice(0, 1000),
      note_type: 'normal',
      privacy: 'public',
    };

    if (firstPost.media?.length) {
      const imageUrls = await Promise.all(
        firstPost.media.slice(0, 9).map(async (media) => {
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

  override handleErrors(
    body: string
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    try {
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
}
