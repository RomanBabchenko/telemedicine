import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ConsumeInviteBodyDto {
  // 12-char short codes today, 64-hex tokens from links issued earlier.
  @ApiProperty({ description: 'Invite token from the emailed / SMSed link' })
  @IsString()
  @Length(8, 128)
  token!: string;
}
