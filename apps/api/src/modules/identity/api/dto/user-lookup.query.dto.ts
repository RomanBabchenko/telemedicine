import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class UserLookupQueryDto {
  @ApiProperty({ description: 'Email address to look up' })
  @IsEmail()
  email!: string;
}
