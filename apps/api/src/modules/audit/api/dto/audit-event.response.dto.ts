import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AuditEventDto } from '@telemed/shared-types';
import { PaginatedResponseDto, PaginationMetaDto } from '../../../../common/dto/pagination.dto';

export class AuditEventResponseDto implements AuditEventDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  actorUserId!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  tenantId!: string | null;

  @ApiProperty({ example: 'appointment.reserved' })
  action!: string;

  @ApiProperty({ example: 'Appointment' })
  resourceType!: string;

  @ApiProperty({ type: String, nullable: true })
  resourceId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  ip!: string | null;

  @ApiProperty({ type: String, nullable: true })
  userAgent!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ type: Object, nullable: true, description: 'Entity snapshot before the change' })
  before?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: Object, nullable: true, description: 'Entity snapshot after the change' })
  after?: Record<string, unknown> | null;
}

export class AuditEventsPageResponseDto extends PaginatedResponseDto<AuditEventResponseDto> {
  @ApiProperty({ type: [AuditEventResponseDto] })
  declare items: AuditEventResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  declare meta: PaginationMetaDto;
}
