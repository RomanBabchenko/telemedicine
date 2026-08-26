import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Role } from '@telemed/shared-types';

// Derived from the enum so new roles cannot be forgotten here.
const ROLE_VALUES: Role[] = Object.values(Role);

export class ListUsersQueryDto {
  @ApiPropertyOptional({ enum: ROLE_VALUES })
  @IsOptional()
  @IsIn(ROLE_VALUES)
  role?: Role;

  @ApiPropertyOptional({ description: 'Substring match against email / first / last name (case-insensitive)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'PENDING', 'BLOCKED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'PENDING', 'BLOCKED'])
  status?: 'ACTIVE' | 'PENDING' | 'BLOCKED';

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({
    enum: ['mine', 'all'],
    description: "'all' is PLATFORM_SUPER_ADMIN-only; clinic-level admins always receive own-tenant users.",
  })
  @IsOptional()
  @IsIn(['mine', 'all'])
  scope?: 'mine' | 'all';
}
