import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';
import { CurrentUser, AuthUser, Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable, AuditViewAccess } from '../../../common/audit/decorators';
import { PrescriptionService } from '../application/prescription.service';
import { CreatePrescriptionBodyDto, CreateReferralBodyDto } from './dto';

@ApiTags('prescriptions')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrescriptionController {
  constructor(private readonly service: PrescriptionService) {}

  @Post('appointments/:id/prescriptions')
  @Roles(Role.DOCTOR)
  @Auditable({ action: 'prescription.created', resource: 'Prescription', captureBody: true })
  createPrescription(
    @Param('id') id: string,
    @Body() body: CreatePrescriptionBodyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createPrescription(id, user.id, body.items);
  }

  @Post('prescriptions/:id/sign')
  @Roles(Role.DOCTOR)
  @Auditable({ action: 'prescription.signed', resource: 'Prescription' })
  signPrescription(@Param('id') id: string) {
    return this.service.signPrescription(id);
  }

  @Post('appointments/:id/referrals')
  @Roles(Role.DOCTOR)
  @Auditable({ action: 'referral.created', resource: 'Referral', captureBody: true })
  createReferral(
    @Param('id') id: string,
    @Body() body: CreateReferralBodyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createReferral(id, user.id, body.targetType, body.instructions);
  }

  @Get('appointments/:id/prescriptions')
  @AuditViewAccess('Prescription')
  list(@Param('id') id: string) {
    return this.service.listForAppointment(id);
  }
}
