import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';
import type {
  AuthResponseDto as AuthResponseContract,
  AuthTokensDto as AuthTokensContract,
  AuthUserDto as AuthUserContract,
  InviteContextDto,
} from '@telemed/shared-types';

export class AuthTokensResponseDto implements AuthTokensContract {
  @ApiProperty({ description: 'Short-lived JWT access token' })
  accessToken!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Refresh token for a full session. Null when the session was opened via an invite link — invite holders re-authenticate by consuming the invite URL again.',
  })
  refreshToken!: string | null;

  @ApiProperty({ description: 'Lifetime of the access token in seconds' })
  expiresIn!: number;
}

export class InviteContextResponseDto implements InviteContextDto {
  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({ format: 'uuid' })
  consultationSessionId!: string;
}

export class AuthUserResponseDto implements AuthUserContract {
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Null only for scope === 'invite-anon' — anonymous-patient invites have no User row.",
  })
  id!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ enum: Object.values(Role), isArray: true })
  roles!: Role[];

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  tenantId!: string | null;

  @ApiProperty()
  mfaEnabled!: boolean;

  @ApiPropertyOptional({
    enum: ['full', 'invite', 'invite-anon'],
    description: 'Present on invite-scoped sessions; omitted for full-access sessions.',
  })
  scope?: 'full' | 'invite' | 'invite-anon';

  @ApiPropertyOptional({ type: InviteContextResponseDto })
  inviteCtx?: InviteContextResponseDto;
}

export class AuthResponseDto implements AuthResponseContract {
  @ApiProperty({ type: AuthUserResponseDto })
  user!: AuthUserResponseDto;

  @ApiProperty({ type: AuthTokensResponseDto })
  tokens!: AuthTokensResponseDto;
}
