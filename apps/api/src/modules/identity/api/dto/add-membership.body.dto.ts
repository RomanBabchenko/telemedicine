import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { Role } from '@telemed/shared-types';
import type { AddMembershipDto } from '@telemed/shared-types';

const ROLE_VALUES: Role[] = [
  Role.PATIENT,
  Role.DOCTOR,
  Role.CLINIC_ADMIN,
  Role.CLINIC_OPERATOR,
  Role.PLATFORM_SUPPORT,
  Role.PLATFORM_FINANCE,
  Role.PLATFORM_SUPER_ADMIN,
  Role.MIS_SERVICE,
  Role.AUDITOR,
];

export class AddMembershipBodyDto implements AddMembershipDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ enum: ROLE_VALUES })
  @IsIn(ROLE_VALUES)
  role!: Role;

  @ApiPropertyOptional({ description: 'Mark this membership as the default tenant for the user' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
