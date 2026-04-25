import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { AtLeastOneOf } from '../../../../common/validators/at-least-one-of.validator';
import type { OnlineAppointmentPayload } from '../../domain/ports/mis-connector';

/**
 * DocDream-style online-appointment payload. Used both for Swagger
 * documentation AND runtime validation (the controller still accepts
 * `@Body() body: unknown` so different connectors can normalize their own
 * shapes; after `connector.parseWebhookEvent` the WebhookEventHandler runs
 * `validate()` against this class). When adding a new connector with a
 * divergent schema, document it in this module's README.
 *
 * Validation rules:
 *  - Anonymous (`isAnonymousPatient: true`): all `patient*` fields are
 *    skipped — neither required nor format-checked.
 *  - Named (`isAnonymousPatient !== true`): `patientExternalId`,
 *    `patientFirstName`, `patientLastName` are required, plus at least one
 *    of `patientEmail`/`patientPhone` (notification channel).
 */
export class SubmitAppointmentBodyDto implements OnlineAppointmentPayload {
  @ApiProperty({
    description:
      'MIS-side appointment id. Required — without it the MIS cannot manage the appointment via /by-external/* endpoints (cancel, payment-status, recording, revoke), and idempotency on retried webhooks is impossible.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  externalAppointmentId!: string;

  @ApiProperty({ description: 'MIS-side doctor id (also used to resolve the internal Doctor row)' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  // Cross-field rule "at least one contact channel in named mode" anchored
  // here because doctorExternalId is always required, so the validator runs
  // unconditionally. (Anchoring on isAnonymousPatient breaks because
  // @IsOptional() short-circuits all subsequent validators when undefined.)
  @AtLeastOneOf<SubmitAppointmentBodyDto>(['patientEmail', 'patientPhone'], {
    when: (o) => (o as unknown as SubmitAppointmentBodyDto).isAnonymousPatient !== true,
    message: 'patientEmail or patientPhone is required when isAnonymousPatient is not true',
  })
  doctorExternalId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  doctorFirstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  doctorLastName!: string;

  @ApiProperty({ description: 'Primary specialization shown on the doctor card' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  doctorSpecialization!: string;

  // Stable MIS-side patient id. The single source of identity for cross-webhook
  // deduplication — name/email/phone do not (homonyms, shared family contacts).
  @ApiPropertyOptional({
    description:
      'Required unless isAnonymousPatient=true. Stable MIS-side patient id; used to upsert/lookup the internal Patient via mis_external_mappings.',
  })
  @ValidateIf((o: SubmitAppointmentBodyDto) => o.isAnonymousPatient !== true)
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  patientExternalId?: string;

  @ApiPropertyOptional({ description: 'Required unless isAnonymousPatient=true' })
  @ValidateIf((o: SubmitAppointmentBodyDto) => o.isAnonymousPatient !== true)
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  patientFirstName?: string;

  @ApiPropertyOptional({ description: 'Required unless isAnonymousPatient=true' })
  @ValidateIf((o: SubmitAppointmentBodyDto) => o.isAnonymousPatient !== true)
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  patientLastName?: string;

  // Per-field check validates only the FORMAT when a value is provided.
  // The cross-field "at least one" rule is enforced by @AtLeastOneOf on
  // isAnonymousPatient below.
  @ApiPropertyOptional({
    description: 'patientEmail or patientPhone required unless isAnonymousPatient=true',
  })
  @ValidateIf(
    (o: SubmitAppointmentBodyDto) => o.isAnonymousPatient !== true && o.patientEmail !== undefined,
  )
  @IsEmail()
  @MaxLength(255)
  patientEmail?: string;

  @ApiPropertyOptional({
    description: 'patientEmail or patientPhone required unless isAnonymousPatient=true',
  })
  @ValidateIf(
    (o: SubmitAppointmentBodyDto) => o.isAnonymousPatient !== true && o.patientPhone !== undefined,
  )
  @IsString()
  @Matches(/^\+?[0-9\s\-()]{7,32}$/, {
    message: 'patientPhone must be a valid phone number',
  })
  patientPhone?: string;

  @ApiProperty({ format: 'date-time', description: 'Appointment start (ISO-8601)' })
  @IsISO8601()
  startAt!: string;

  @ApiProperty({ format: 'date-time', description: 'Appointment end (ISO-8601)' })
  @IsISO8601()
  endAt!: string;

  @ApiPropertyOptional({
    enum: ['prepaid', 'postpaid'],
    description:
      "Default: 'postpaid'. postpaid: patient can join immediately. prepaid + paid: same as postpaid. prepaid + unpaid: AWAITING_PAYMENT until the clinic calls the payment-status endpoint.",
  })
  @IsOptional()
  @IsIn(['prepaid', 'postpaid'])
  paymentType?: 'prepaid' | 'postpaid';

  @ApiPropertyOptional({
    enum: ['paid', 'unpaid'],
    description:
      "Default: 'unpaid'. Combined with paymentType to derive the initial appointment status. Update later via PATCH /appointments/:id/payment-status as the clinic confirms payment.",
  })
  @IsOptional()
  @IsIn(['paid', 'unpaid'])
  paymentStatus?: 'paid' | 'unpaid';

  @ApiPropertyOptional({
    description:
      "When true: no PII is shared. Appointment gets patient_id=null, the patient's invite JWT is issued with scope='invite-anon'.",
  })
  @IsOptional()
  @IsBoolean()
  isAnonymousPatient?: boolean;
}
