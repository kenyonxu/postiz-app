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
