import { ApiProperty } from '@nestjs/swagger';

export class ReissueInvitesResponseDto {
  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({ format: 'uuid' })
  consultationSessionId!: string;

  @ApiProperty({ description: 'Fresh patient invite URL (previous links are revoked)' })
  patientInviteUrl!: string;

  @ApiProperty({ description: 'Fresh doctor invite URL (previous links are revoked)' })
  doctorInviteUrl!: string;
}
