import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';
import { AuthUser, CurrentUser, Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable, AuditViewAccess } from '../../../common/audit/decorators';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { PrescriptionService } from '../application/prescription.service';
import {
  AppointmentDocumentsResponseDto,
  CreatePrescriptionBodyDto,
  CreateReferralBodyDto,
  PrescriptionResponseDto,
  ReferralResponseDto,
} from './dto';
import {
  toPrescriptionResponse,
  toReferralResponse,
} from './mappers/prescription.mapper';

@ApiTags('prescriptions')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class PrescriptionController {
  constructor(private readonly service: PrescriptionService) {}

  @Post('appointments/:id/prescriptions')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.DOCTOR)
  @Auditable({ action: 'prescription.created', resource: 'Prescription', captureBody: true })
  @ApiOperation({
    summary: 'Issue a draft prescription for an appointment',
    description: 'Doctor-only. Created in DRAFT status; call POST /prescriptions/:id/sign to finalise it (renders the PDF).',
    operationId: 'createPrescription',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Appointment id' })
  @ApiBody({ type: CreatePrescriptionBodyDto })
  @ApiCreatedResponse({ type: PrescriptionResponseDto })
  @ApiStandardErrors()
  async createPrescription(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreatePrescriptionBodyDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PrescriptionResponseDto> {
    const p = await this.service.createPrescription(id, user.id, body.items);
    return toPrescriptionResponse(p);
  }

  @Post('prescriptions/:id/sign')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.DOCTOR)
  @Auditable({ action: 'prescription.signed', resource: 'Prescription' })
  @ApiOperation({
    summary: 'Sign a draft prescription',
    description: 'Idempotent. Renders and stores the PDF on first sign, re-signs are no-op.',
    operationId: 'signPrescription',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PrescriptionResponseDto })
  @ApiStandardErrors()
  async signPrescription(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PrescriptionResponseDto> {
    const p = await this.service.signPrescription(id);
    return toPrescriptionResponse(p);
  }

  @Post('appointments/:id/referrals')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.DOCTOR)
  @Auditable({ action: 'referral.created', resource: 'Referral', captureBody: true })
  @ApiOperation({
    summary: 'Issue a referral (lab, imaging, specialist or in-person visit)',
    description: 'Referrals are created in SIGNED status with a rendered PDF immediately — no separate sign step.',
    operationId: 'createReferral',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Appointment id' })
  @ApiBody({ type: CreateReferralBodyDto })
  @ApiCreatedResponse({ type: ReferralResponseDto })
  @ApiStandardErrors()
  async createReferral(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateReferralBodyDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ReferralResponseDto> {
    const r = await this.service.createReferral(id, user.id, body.targetType, body.instructions);
    return toReferralResponse(r);
  }

  @Get('appointments/:id/prescriptions')
  @AuditViewAccess('Prescription')
  @ApiOperation({
    summary: 'List prescriptions and referrals attached to an appointment',
    operationId: 'listAppointmentPrescriptions',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Appointment id' })
  @ApiOkResponse({ type: AppointmentDocumentsResponseDto })
  @ApiStandardErrors()
  async list(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AppointmentDocumentsResponseDto> {
    const { prescriptions, referrals } = await this.service.listForAppointment(id);
    return {
      prescriptions: prescriptions.map(toPrescriptionResponse),
      referrals: referrals.map(toReferralResponse),
    };
  }
}
