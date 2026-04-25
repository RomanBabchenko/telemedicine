import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ConsumeInviteBodyDto {
  @ApiProperty({ description: 'Single-use invite token from the emailed / SMSed link' })
  @IsString()
  token!: string;
}
