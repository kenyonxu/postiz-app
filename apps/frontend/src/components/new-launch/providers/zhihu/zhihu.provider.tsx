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
