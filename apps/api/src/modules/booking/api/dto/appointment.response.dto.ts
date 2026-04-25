import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus } from '@telemed/shared-types';
import type {
  AppointmentDoctorSummary,
  AppointmentDto,
  AppointmentPatientSummary,
} from '@telemed/shared-types';

export class AppointmentPatientSummaryDto implements AppointmentPatientSummary {
  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;
}

export class AppointmentDoctorSummaryDto implements AppointmentDoctorSummary {
  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ type: [String] })
  specializations!: string[];
}

export class AppointmentResponseDto implements AppointmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  doctorId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Null for anonymous-patient appointments (isAnonymousPatient === true).',
  })
  patientId!: string | null;

  @ApiPropertyOptional({
    description:
      'True when created via an anonymous MIS webhook — no Patient row, no PII. UI hides name/contact widgets.',
  })
  isAnonymousPatient?: boolean;

  @ApiProperty({ format: 'uuid' })
  serviceTypeId!: string;

  @ApiProperty({ format: 'uuid' })
  slotId!: string;

  @ApiProperty({ enum: Object.values(AppointmentStatus) })
  status!: AppointmentStatus;

  @ApiProperty({ type: String, nullable: true })
  reasonText!: string | null;

  @ApiProperty({ format: 'date-time' })
  startAt!: string;

  @ApiProperty({ format: 'date-time' })
  endAt!: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  paymentId!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  consultationSessionId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({
    enum: ['prepaid', 'postpaid'],
    nullable: true,
    description: "Set only when the appointment originated from a MIS webhook with explicit payment instructions.",
  })
  misPaymentType?: 'prepaid' | 'postpaid' | null;

  @ApiPropertyOptional({
    enum: ['paid', 'unpaid'],
    nullable: true,
    description:
      "Set only for MIS-originated appointments. When misPaymentType==='prepaid' && misPaymentStatus!=='paid', the patient is blocked from joining until the clinic marks the appointment as paid.",
  })
  misPaymentStatus?: 'paid' | 'unpaid' | null;

  @ApiPropertyOptional({
    type: AppointmentPatientSummaryDto,
    description: 'Populated by list endpoints so admin/doctor UIs avoid N+1 lookups.',
  })
  patient?: AppointmentPatientSummaryDto;

  @ApiPropertyOptional({ type: AppointmentDoctorSummaryDto })
  doctor?: AppointmentDoctorSummaryDto;
}
