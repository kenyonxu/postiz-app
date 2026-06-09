import { IsDefined, IsString, MaxLength, MinLength } from 'class-validator';

export class XiaohongshuSettingsDto {
  @IsString()
  @IsDefined()
  @MinLength(1)
  @MaxLength(20)
  title: string;
}
