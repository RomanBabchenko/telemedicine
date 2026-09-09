import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AppointmentSource, AppointmentStatus } from '@telemed/shared-types';
import type { AppointmentListQuery, AppointmentListSort } from '@telemed/shared-types';

export const APPOINTMENT_LIST_SORTS: AppointmentListSort[] = [
  'startAt',
  'patient',
  'doctor',
  'status',
  'source',
];

export class ListAppointmentsQueryDto implements AppointmentListQuery {
  @ApiPropertyOptional({
    description: 'Case-insensitive substring match on patient name, patient phone or doctor name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  search?: string;

  @ApiPropertyOptional({ enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiPropertyOptional({
    enum: AppointmentSource,
    description: 'Ignored for MIS-scoped actors (they always get MIS rows)',
  })
  @IsOptional()
  @IsEnum(AppointmentSource)
  source?: AppointmentSource;

  @ApiPropertyOptional({ enum: APPOINTMENT_LIST_SORTS, default: 'startAt' })
  @IsOptional()
  @IsIn(APPOINTMENT_LIST_SORTS)
  sort?: AppointmentListSort;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
