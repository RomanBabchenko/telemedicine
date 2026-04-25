import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class IdParamDto {
  @ApiProperty({ format: 'uuid', description: 'Resource identifier (UUID v4)' })
  @IsUUID()
  id!: string;
}
