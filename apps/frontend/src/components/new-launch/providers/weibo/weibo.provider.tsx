'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { WeiboSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/weibo.settings.dto';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const WeiboSettings: FC = () => {
  const t = useT();

  return (
    <div className="text-sm text-gray-500">
      <p>{t('weibo_char_limit', '微博限制 140 字，最多 9 张图片')}</p>
    </div>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [
    { format: 'no-pictures', type: 'post', maximumCharacters: 1 },
  ],
  SettingsComponent: WeiboSettings,
  CustomPreviewComponent: undefined,
  dto: WeiboSettingsDto,
  maximumCharacters: 140,
});
