import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import {
  AuthUser,
  CurrentUser,
  InviteAccessible,
  Public,
  Roles,
} from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { Idempotent } from '../../../common/decorators/idempotent.decorator';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { AvailabilityService } from '../application/availability.service';
import { AppointmentService } from '../application/appointment.service';
import { PatientService } from '../../patient/application/patient.service';
import { ProviderService } from '../../provider/application/provider.service';
import {
  AppointmentResponseDto,
  AvailabilityQueryDto,
  CancelBodyDto,
  ReserveBodyDto,
  SlotResponseDto,
} from './dto';
import { toAppointmentResponse } from './mappers/appointment.mapper';
import { toSlotResponse } from './mappers/slot.mapper';

@ApiTags('booking')
@Controller()
export class BookingController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly appointments: AppointmentService,
    private readonly patients: PatientService,
    private readonly providers: ProviderService,
  ) {}

  @Get('availability')
  @Public()
  @ApiOperation({
    summary: "List a doctor's open slots within a time window",
    description: 'Returns only slots with status OPEN in the current tenant. Public endpoint — no authentication required.',
    operationId: 'listAvailability',
  })
  @ApiOkResponse({ type: [SlotResponseDto] })
  @ApiStandardErrors()
  async listAvailability(@Query() query: AvailabilityQueryDto): Promise<SlotResponseDto[]> {
    const slots = await this.availability.listAvailable(
      query.doctorId,
      query.serviceTypeId,
      new Date(query.from),
      new Date(query.to),
    );
    return slots.map(toSlotResponse);
  }

  @Post('appointments/reserve')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PATIENT, Role.CLINIC_OPERATOR, Role.CLINIC_ADMIN)
  @Auditable({ action: 'appointment.reserved', resource: 'Appointment' })
  @Idempotent()
  @ApiAuth()
  @ApiOperation({
    summary: 'Reserve a slot for an appointment',
    description:
      'Patients may omit patientId (self-reservation is inferred from the JWT). Operators/admins must supply it. The slot is placed under a pessimistic hold; call /appointments/:id/confirm after payment succeeds. Supports Idempotency-Key header — replays return the cached response.',
    operationId: 'reserveAppointment',
  })
  @ApiBody({ type: ReserveBodyDto })
  @ApiCreatedResponse({ type: AppointmentResponseDto })
  @ApiStandardErrors()
  async reserve(
    @CurrentUser() user: AuthUser,
    @Body() body: ReserveBodyDto,
  ): Promise<AppointmentResponseDto> {
    let patientId = body.patientId;
    if (!patientId) {
      const me = await this.patients.getByUserId(user.id);
      patientId = me.id;
    }
    const appointment = await this.appointments.reserve({
      slotId: body.slotId,
      patientId,
      reasonText: body.reasonText,
    });
    return toAppointmentResponse(appointment);
  }

  @Post('appointments/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PATIENT, Role.CLINIC_OPERATOR, Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'appointment.confirmed', resource: 'Appointment' })
  @ApiAuth()
  @ApiOperation({
    summary: 'Confirm a reserved appointment',
    description: 'Moves the appointment into CONFIRMED and locks the slot (status=BOOKED).',
    operationId: 'confirmAppointment',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AppointmentResponseDto })
  @ApiStandardErrors()
  async confirm(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AppointmentResponseDto> {
    const appointment = await this.appointments.confirm(id);
    return toAppointmentResponse(appointment);
  }

  @Post('appointments/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Auditable({ action: 'appointment.cancelled', resource: 'Appointment' })
  @ApiAuth()
  @ApiOperation({
    summary: 'Cancel an appointment',
    description:
      'Cancellation attribution follows the caller role: PATIENT → CANCELLED_BY_PATIENT, everyone else → CANCELLED_BY_PROVIDER. The slot is released back to OPEN.',
    operationId: 'cancelAppointment',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: CancelBodyDto })
  @ApiOkResponse({ type: AppointmentResponseDto })
  @ApiStandardErrors()
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CancelBodyDto,
  ): Promise<AppointmentResponseDto> {
    const byPatient = user.roles.includes(Role.PATIENT);
    const appointment = await this.appointments.cancel(id, byPatient, body.reason);
    return toAppointmentResponse(appointment);
  }

  @Get('appointments')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @ApiOperation({
    summary: "List the caller's appointments",
    description:
      "Role-aware: patients see their own appointments, doctors see theirs, operators/admins see every appointment in the tenant. Invite-scoped callers always receive [].",
    operationId: 'listAppointments',
  })
  @ApiOkResponse({ type: [AppointmentResponseDto] })
  @ApiStandardErrors()
  async list(@CurrentUser() user: AuthUser): Promise<AppointmentResponseDto[]> {
    // Invite-scoped holders (named or anonymous) have no dashboard concept —
    // this endpoint also lacks @InviteAccessible, so the guard blocks them
    // anyway. Early return preserves that contract if the decorator is ever
    // added and avoids patients.getByUserId(user.id) throwing on the
    // anonymous pseudonym (which is not a real user id).
    if (user.scope === 'invite' || user.scope === 'invite-anon') {
      return [];
    }
    if (user.roles.includes(Role.PATIENT)) {
      const patient = await this.patients.getByUserId(user.id);
      return this.appointments.listForRole({ patientId: patient.id });
    }
    if (user.roles.includes(Role.DOCTOR)) {
      const doctor = await this.providers.getDoctorByUserId(user.id);
      if (!doctor) throw new BadRequestException('Doctor profile missing');
      return this.appointments.listForRole({ doctorId: doctor.id });
    }
    return this.appointments.listForRole({});
  }

  @Get('appointments/:id')
  @UseGuards(JwtAuthGuard)
  @InviteAccessible('appointmentId')
  @ApiAuth()
  @ApiOperation({
    summary: 'Fetch a single appointment',
    description:
      'Invite-scoped callers may fetch their own appointment (by matching resource id) even without a full-access session.',
    operationId: 'getAppointmentById',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AppointmentResponseDto })
  @ApiStandardErrors()
  async getById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AppointmentResponseDto> {
    const appointment = await this.appointments.getById(id);
    return toAppointmentResponse(appointment);
  }
}
