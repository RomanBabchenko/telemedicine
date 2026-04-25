import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import type { MfaVerifyDto } from '@telemed/shared-types';

export class MfaVerifyBodyDto implements MfaVerifyDto {
  @ApiProperty({ minLength: 6, maxLength: 6, description: 'Six-digit TOTP code from the authenticator app' })
  @IsString()
  @Length(6, 6)
  code!: string;
}
