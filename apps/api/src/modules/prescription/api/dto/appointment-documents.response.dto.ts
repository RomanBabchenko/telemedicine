import { ApiProperty } from '@nestjs/swagger';
import { PrescriptionResponseDto } from './prescription.response.dto';
import { ReferralResponseDto } from './referral.response.dto';

export class AppointmentDocumentsResponseDto {
  @ApiProperty({ type: [PrescriptionResponseDto] })
  prescriptions!: PrescriptionResponseDto[];

  @ApiProperty({ type: [ReferralResponseDto] })
  referrals!: ReferralResponseDto[];
}
