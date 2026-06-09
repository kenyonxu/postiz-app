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
  oneTimeToken = false;
  override maxConcurrentJob = 1;

  maxLength() {
    return 140;
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

    const { access_token, expires_in, uid } = tokenRes;

    const userRes = await (
      await fetch(
        `https://api.weibo.com/2/users/show.json?access_token=${access_token}&uid=${uid}`
      )
    ).json();

    const { screen_name, name, avatar_large } = userRes;

    return {
      id: String(uid),
      accessToken: access_token,
      refreshToken: '',
      expiresIn: expires_in,
      name: name || screen_name,
      picture: avatar_large || '',
      username: screen_name,
    };
  }

  async refreshToken(_refreshToken: string): Promise<AuthTokenDetails> {
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

    let picIds = '';
    if (firstPost.media?.length) {
      const uploadResponses = await Promise.all(
        firstPost.media.slice(0, 9).map(async (media) => {
          const formData = new FormData();
          formData.append('access_token', accessToken);
          formData.append('status', message || '分享图片');
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

      if (picIds) {
        const urlBody = new URLSearchParams();
        urlBody.append('access_token', accessToken);
        urlBody.append('status', message);
        urlBody.append('pic_id', picIds);

        const final = await (
          await this.fetch(
            'https://api.weibo.com/2/statuses/upload_url_text.json',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: urlBody,
            }
          )
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

  override handleErrors(
    body: string
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    try {
      const err = JSON.parse(body);
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
    posts: Array<ValidityMedia[]>,
    _settings: any,
    _additionalSettings: any[]
  ): Promise<string | true> {
    const [firstPost] = posts ?? [];

    if ((firstPost?.length ?? 0) > 9) {
      return '微博最多支持 9 张图片';
    }

    if (firstPost?.some((p) => (p.path?.indexOf?.('mp4') ?? -1) > -1)) {
      return '微博视频发布暂未支持（将在后续版本实现）';
    }

    return true;
  }
}
