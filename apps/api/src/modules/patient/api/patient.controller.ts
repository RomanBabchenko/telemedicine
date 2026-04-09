import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { Auditable } from '../../../common/audit/decorators';
import { PatientService } from '../application/patient.service';
import { GrantConsentBodyDto, UpdatePatientBodyDto } from './dto';

const toPatientDto = (p: {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  preferredLocale: string;
}) => ({
  id: p.id,
  firstName: p.firstName,
  lastName: p.lastName,
  dateOfBirth: p.dateOfBirth,
  gender: p.gender,
  email: p.email,
  phone: p.phone,
  preferredLocale: p.preferredLocale,
});

@ApiTags('patients')
@ApiBearerAuth()
@Controller('patients/me')
@UseGuards(JwtAuthGuard)
export class PatientController {
  constructor(private readonly service: PatientService) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const p = await this.service.getByUserId(user.id);
    return toPatientDto(p);
  }

  @Patch()
  @Auditable({ action: 'patient.updated', resource: 'Patient' })
  async update(@CurrentUser() user: AuthUser, @Body() body: UpdatePatientBodyDto) {
    const p = await this.service.updateMe(user.id, body);
    return toPatientDto(p);
  }

  @Get('appointments')
  async myAppointments(@CurrentUser() user: AuthUser) {
    return this.service.myAppointments(user.id);
  }

  @Get('documents')
  async myDocuments(@CurrentUser() user: AuthUser) {
    return this.service.myDocuments(user.id);
  }

  @Get('consents')
  async myConsents(@CurrentUser() user: AuthUser) {
    return this.service.myConsents(user.id);
  }

  @Post('consents')
  @Auditable({ action: 'consent.granted', resource: 'Consent' })
  async grant(@CurrentUser() user: AuthUser, @Body() body: GrantConsentBodyDto) {
    return this.service.grantConsent(user.id, body.type, body.versionCode ?? 'v1');
  }
}
