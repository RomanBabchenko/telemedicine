import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class RevokeInvitesBodyDto {
  @ApiPropertyOptional({
    enum: ['PATIENT', 'DOCTOR'],
    description: 'Scope revocation to a single participant role; both sides revoked when omitted',
  })
  @IsOptional()
  @IsIn(['PATIENT', 'DOCTOR'])
  role?: 'PATIENT' | 'DOCTOR';
}
