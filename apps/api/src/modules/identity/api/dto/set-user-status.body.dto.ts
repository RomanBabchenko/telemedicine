import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class SetUserStatusBodyDto {
  @ApiProperty({ enum: ['ACTIVE', 'BLOCKED'] })
  @IsIn(['ACTIVE', 'BLOCKED'])
  status!: 'ACTIVE' | 'BLOCKED';
}
