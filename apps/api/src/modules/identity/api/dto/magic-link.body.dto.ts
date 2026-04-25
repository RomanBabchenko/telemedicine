import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';
import type { MagicLinkConsumeDto, MagicLinkRequestDto } from '@telemed/shared-types';

export class MagicLinkRequestBodyDto implements MagicLinkRequestDto {
  @ApiProperty({ description: 'Email address the magic link will be sent to' })
  @IsEmail()
  email!: string;
}

export class MagicLinkConsumeBodyDto implements MagicLinkConsumeDto {
  @ApiProperty({ description: 'Opaque single-use token from the emailed magic link' })
  @IsString()
  token!: string;
}
