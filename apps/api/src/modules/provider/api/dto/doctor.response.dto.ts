import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationStatus } from '@telemed/shared-types';
import type { DoctorTenantProfileDto } from '@telemed/shared-types';
import { PaginatedResponseDto, PaginationMetaDto } from '../../../../common/dto/pagination.dto';

// NOTE: DoctorResponseDto does NOT `implements DoctorDto` — the shared-types
// interface types `licenseNumber: string` but the actual runtime/DB column is
// nullable. Implementing the interface would force a lie; instead the class
// declares `string | null` and matches reality. A separate PR should tighten
// the shared-types interface.

export class DoctorTenantProfileResponseDto implements DoctorTenantProfileDto {
  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty()
  price!: number;

  @ApiProperty()
  isPublished!: boolean;

  @ApiProperty({ description: 'True when the slot source of truth is an external MIS' })
  slotSourceIsMis!: boolean;
}

export class DoctorResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ type: [String] })
  specializations!: string[];

  @ApiProperty({ type: [String] })
  subspecializations!: string[];

  @ApiProperty({ type: String, nullable: true })
  licenseNumber!: string | null;

  @ApiProperty()
  yearsOfExperience!: number;

  @ApiProperty({ type: [String] })
  languages!: string[];

  @ApiProperty({ type: String, nullable: true })
  bio!: string | null;

  @ApiProperty({ type: String, nullable: true })
  photoUrl!: string | null;

  @ApiProperty({ enum: Object.values(VerificationStatus) })
  verificationStatus!: VerificationStatus;

  @ApiProperty({ type: Number, nullable: true })
  rating!: number | null;

  @ApiProperty({ description: 'Price in the current tenant (resolved from DoctorTenantProfile)' })
  basePrice!: number;

  @ApiProperty()
  defaultDurationMin!: number;

  @ApiProperty({ description: 'Whether the doctor is active (published) in the current tenant' })
  isPublished!: boolean;

  @ApiPropertyOptional({ type: [DoctorTenantProfileResponseDto] })
  tenantProfiles?: DoctorTenantProfileResponseDto[];
}

export class DoctorsPageResponseDto extends PaginatedResponseDto<DoctorResponseDto> {
  @ApiProperty({ type: [DoctorResponseDto] })
  declare items: DoctorResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  declare meta: PaginationMetaDto;
}
