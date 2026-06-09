import { IsOptional, IsBoolean } from 'class-validator';

export class WeiboSettingsDto {
  @IsOptional()
  @IsBoolean()
  is_long_text?: boolean;
}
