import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import type { RefreshDto } from '@telemed/shared-types';

export class RefreshBodyDto implements RefreshDto {
  @ApiProperty({ description: 'Refresh token previously issued at login' })
  @IsString()
  refreshToken!: string;
}
