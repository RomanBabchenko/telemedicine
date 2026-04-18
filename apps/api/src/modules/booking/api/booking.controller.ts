import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';
import { CurrentUser, AuthUser, InviteAccessible, Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { AvailabilityService } from '../application/availability.service';
import { AppointmentService } from '../application/appointment.service';
import { PatientService } from '../../patient/application/patient.service';
import { ProviderService } from '../../provider/application/provider.service';
import { AvailabilityQueryDto, CancelBodyDto, ReserveBodyDto } from './dto';

@ApiTags('booking')
@ApiBearerAuth()
@Controller()
export class BookingController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly appointments: AppointmentService,
    private readonly patients: PatientService,
    private readonly providers: ProviderService,
  ) {}

  @Get('availability')
  async listAvailability(@Query() query: AvailabilityQueryDto) {
    return this.availability.listAvailable(
      query.doctorId,
      query.serviceTypeId,
      new Date(query.from),
      new Date(query.to),
    );
  }

  @Post('appointments/reserve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PATIENT, Role.CLINIC_OPERATOR, Role.CLINIC_ADMIN)
  @Auditable({ action: 'appointment.reserved', resource: 'Appointment' })
  async reserve(@CurrentUser() user: AuthUser, @Body() body: ReserveBodyDto) {
    let patientId = body.patientId;
    if (!patientId) {
      const me = await this.patients.getByUserId(user.id);
      patientId = me.id;
    }
    return this.appointments.reserve({
      slotId: body.slotId,
      patientId,
      reasonText: body.reasonText,
    });
  }

  @Post('appointments/:id/confirm')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PATIENT, Role.CLINIC_OPERATOR, Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'appointment.confirmed', resource: 'Appointment' })
  confirm(@Param('id') id: string) {
    return this.appointments.confirm(id);
  }

  @Post('appointments/:id/cancel')
  @UseGuards(JwtAuthGuard)
  @Auditable({ action: 'appointment.cancelled', resource: 'Appointment' })
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CancelBodyDto,
  ) {
    const byPatient = user.roles.includes(Role.PATIENT);
    return this.appointments.cancel(id, byPatient, body.reason);
  }

  @Get('appointments')
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: AuthUser) {
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
  getById(@Param('id') id: string) {
    return this.appointments.getById(id);
  }
}
