import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { Role } from '@telemed/shared-types';
import type { AddMembershipDto } from '@telemed/shared-types';

// Derived from the enum so new roles cannot be forgotten here.
const ROLE_VALUES: Role[] = Object.values(Role);

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
