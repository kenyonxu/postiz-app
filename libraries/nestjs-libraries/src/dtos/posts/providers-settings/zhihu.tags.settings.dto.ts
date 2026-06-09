import { IsString, MinLength } from 'class-validator';

export class ZhihuTagSettingsDto {
  @IsString()
  @MinLength(1)
  label: string;
}
