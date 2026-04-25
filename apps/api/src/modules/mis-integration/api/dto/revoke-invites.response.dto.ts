import { ApiProperty } from '@nestjs/swagger';

export class RevokeInvitesResponseDto {
  @ApiProperty({ example: true })
  ok!: true;

  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({ description: 'Number of invite links actually revoked' })
  revoked!: number;
}
