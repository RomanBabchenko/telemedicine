import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListAuditEventsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by domain resource type (e.g. "Appointment", "User")' })
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional({ description: 'Filter by a specific resource id' })
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by actor user id' })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @ApiPropertyOptional({ description: 'Filter by action code (e.g. "appointment.reserved")' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
