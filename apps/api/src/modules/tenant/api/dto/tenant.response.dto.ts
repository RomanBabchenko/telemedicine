import { ApiProperty } from '@nestjs/swagger';
import type {
  TenantAudioPolicyDto,
  TenantInvitePolicyDto,
} from '@telemed/shared-types';

// NOTE: TenantResponseDto deliberately does NOT implement TenantDto from
// shared-types. The shared interface requires a strict `TenantFeatureMatrix`
// object; runtime keeps a loose `Record<string, boolean>` on the entity and
// has done since day one. Implementing the interface would lie about the
// shape. A separate PR should tighten both sides.

export class TenantAudioPolicyResponseDto implements TenantAudioPolicyDto {
  @ApiProperty()
  enabled!: boolean;

  @ApiProperty()
  retentionDays!: number;

  @ApiProperty()
  consentRequired!: boolean;
}

export class TenantInvitePolicyResponseDto implements TenantInvitePolicyDto {
  @ApiProperty({ required: false })
  bindIp?: boolean;

  @ApiProperty({ required: false })
  bindUserAgent?: boolean;
}

export class TenantResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  brandName!: string;

  @ApiProperty()
  subdomain!: string;

  @ApiProperty({ example: '#1f7ae0' })
  primaryColor!: string;

  @ApiProperty({ type: String, nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ example: 'uk' })
  locale!: string;

  @ApiProperty({ example: 'UAH' })
  currency!: string;

  @ApiProperty({
    type: Object,
    description: 'Partial feature matrix (keys like b2cListing, bookingWidget, ...)',
  })
  features!: Record<string, boolean>;

  @ApiProperty({ type: TenantAudioPolicyResponseDto })
  audioPolicy!: TenantAudioPolicyResponseDto;

  @ApiProperty({ type: TenantInvitePolicyResponseDto })
  invitePolicy!: TenantInvitePolicyResponseDto;
}
