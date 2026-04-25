import { ApiProperty } from '@nestjs/swagger';
import type { JoinTokenDto } from '@telemed/shared-types';

export class JoinTokenResponseDto implements JoinTokenDto {
  @ApiProperty({ description: 'LiveKit access token — passed to the LiveKit SDK in the browser' })
  token!: string;

  @ApiProperty({ description: 'LiveKit WebSocket URL the SDK connects to' })
  livekitUrl!: string;

  @ApiProperty({ description: 'LiveKit room identifier' })
  roomName!: string;

  @ApiProperty({ description: "Participant identity — 'doctor-<id>', 'patient-<id>' or 'patient-anon-<inviteId>'" })
  identity!: string;

  @ApiProperty({ format: 'date-time', description: 'When this token stops being valid' })
  expiresAt!: string;
}
