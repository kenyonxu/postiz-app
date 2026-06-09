'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { XiaohongshuSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/xiaohongshu.settings.dto';
import { Input } from '@gitroom/react/form/input';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const XiaohongshuSettings: FC = () => {
  const t = useT();
  const { register, watch } = useSettings();
  const title = watch('title');

  return (
    <div>
      <Input
        label={t('xiaohongshu_title', '笔记标题')}
        placeholder={t(
          'xiaohongshu_title_placeholder',
          '请输入笔记标题（1-20字）'
        )}
        maxLength={20}
        {...register('title')}
      />
      <div className="text-xs text-gray-400 mt-1">
        {(title as string)?.length || 0}/20
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {t(
          'xiaohongshu_note_tips',
          '小红书笔记要求：至少 1 张图片，正文最多 1000 字'
        )}
      </p>
    </div>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [
    { format: 'with-pictures', type: 'post', maximumCharacters: 1 },
  ],
  SettingsComponent: XiaohongshuSettings,
  CustomPreviewComponent: undefined,
  dto: XiaohongshuSettingsDto,
  maximumCharacters: 1000,
});
