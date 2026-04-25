import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { AuthUser, CurrentUser } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { Auditable } from '../../../common/audit/decorators';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { AppointmentResponseDto } from '../../booking/api/dto/appointment.response.dto';
import { toAppointmentResponse } from '../../booking/api/mappers/appointment.mapper';
import { PatientService } from '../application/patient.service';
import {
  ConsentResponseDto,
  DownloadUrlResponseDto,
  GrantConsentBodyDto,
  PatientDocumentResponseDto,
  PatientResponseDto,
  UpdatePatientBodyDto,
} from './dto';
import {
  toConsentResponse,
  toPatientResponse,
} from './mappers/patient.mapper';

@ApiTags('patients')
@Controller('patients/me')
@UseGuards(JwtAuthGuard)
@ApiAuth()
export class PatientController {
  constructor(private readonly service: PatientService) {}

  @Get()
  @ApiOperation({
    summary: "Fetch the caller's patient profile",
    operationId: 'getMyPatientProfile',
  })
  @ApiOkResponse({ type: PatientResponseDto })
  @ApiStandardErrors()
  async me(@CurrentUser() user: AuthUser): Promise<PatientResponseDto> {
    const p = await this.service.getByUserId(user.id);
    return toPatientResponse(p);
  }

  @Patch()
  @Auditable({ action: 'patient.updated', resource: 'Patient' })
  @ApiOperation({
    summary: 'Update the caller’s patient profile',
    operationId: 'updateMyPatientProfile',
  })
  @ApiBody({ type: UpdatePatientBodyDto })
  @ApiOkResponse({ type: PatientResponseDto })
  @ApiStandardErrors()
  async update(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdatePatientBodyDto,
  ): Promise<PatientResponseDto> {
    const p = await this.service.updateMe(user.id, body);
    return toPatientResponse(p);
  }

  @Get('appointments')
  @ApiOperation({
    summary: "List the caller's own appointments",
    description: 'Ordered newest-first. Use GET /appointments for role-aware listings.',
    operationId: 'listMyPatientAppointments',
  })
  @ApiOkResponse({ type: [AppointmentResponseDto] })
  @ApiStandardErrors()
  async myAppointments(
    @CurrentUser() user: AuthUser,
  ): Promise<AppointmentResponseDto[]> {
    const rows = await this.service.myAppointments(user.id);
    return rows.map(toAppointmentResponse);
  }

  @Get('documents')
  @ApiOperation({
    summary: "List the caller's medical documents",
    description: 'Ordered newest-first. pdfUrl is null here — use GET /documents/:id/pdf to obtain a signed download URL.',
    operationId: 'listMyPatientDocuments',
  })
  @ApiOkResponse({ type: [PatientDocumentResponseDto] })
  @ApiStandardErrors()
  myDocuments(
    @CurrentUser() user: AuthUser,
  ): Promise<PatientDocumentResponseDto[]> {
    return this.service.myDocuments(user.id);
  }

  @Get('documents/:id/pdf')
  @ApiOperation({
    summary: "Obtain a signed download URL for the caller's own document PDF",
    description: 'Ownership is enforced via 404 (not 403) to avoid leaking document existence.',
    operationId: 'getMyPatientDocumentPdfUrl',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: DownloadUrlResponseDto })
  @ApiStandardErrors()
  myDocumentPdf(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DownloadUrlResponseDto> {
    return this.service.getMyDocumentPdfUrl(user.id, id);
  }

  @Get('consents')
  @ApiOperation({
    summary: "List the caller's consents",
    operationId: 'listMyConsents',
  })
  @ApiOkResponse({ type: [ConsentResponseDto] })
  @ApiStandardErrors()
  async myConsents(@CurrentUser() user: AuthUser): Promise<ConsentResponseDto[]> {
    const rows = await this.service.myConsents(user.id);
    return rows.map(toConsentResponse);
  }

  @Post('consents')
  @HttpCode(HttpStatus.CREATED)
  @Auditable({ action: 'consent.granted', resource: 'Consent' })
  @ApiOperation({
    summary: 'Grant a new consent',
    description: 'Idempotent — granting an already-granted consent returns the existing row.',
    operationId: 'grantMyConsent',
  })
  @ApiBody({ type: GrantConsentBodyDto })
  @ApiCreatedResponse({ type: ConsentResponseDto })
  @ApiStandardErrors()
  async grant(
    @CurrentUser() user: AuthUser,
    @Body() body: GrantConsentBodyDto,
  ): Promise<ConsentResponseDto> {
    const c = await this.service.grantConsent(user.id, body.type, body.versionCode ?? 'v1');
    return toConsentResponse(c);
  }
}
