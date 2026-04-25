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
import { DownloadUrlResponseDto } from '../../patient/api/dto/download-url.response.dto';
import { DocumentationService } from '../application/documentation.service';
import {
  CreateConclusionBodyDto,
  MedicalDocumentResponseDto,
} from './dto';
import { toMedicalDocumentResponse } from './mappers/document.mapper';

@ApiTags('documents')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class DocumentationController {
  constructor(private readonly service: DocumentationService) {}

  @Get('appointments/:id/documents')
  @AuditViewAccess('MedicalDocument')
  @ApiOperation({
    summary: 'List medical documents attached to an appointment',
    operationId: 'listAppointmentDocuments',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Appointment id' })
  @ApiOkResponse({ type: [MedicalDocumentResponseDto] })
  @ApiStandardErrors()
  async list(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MedicalDocumentResponseDto[]> {
    const docs = await this.service.listForAppointment(id);
    return docs.map(toMedicalDocumentResponse);
  }

  @Post('appointments/:id/documents/conclusion')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.DOCTOR)
  @Auditable({ action: 'document.created', resource: 'MedicalDocument', captureBody: true })
  @ApiOperation({
    summary: 'Create a draft conclusion for an appointment',
    description: 'Doctor-only. The document is created in DRAFT status; call POST /documents/:id/sign to finalise it.',
    operationId: 'createConclusion',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Appointment id' })
  @ApiBody({ type: CreateConclusionBodyDto })
  @ApiCreatedResponse({ type: MedicalDocumentResponseDto })
  @ApiStandardErrors()
  async createConclusion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateConclusionBodyDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MedicalDocumentResponseDto> {
    const doc = await this.service.createConclusion({
      appointmentId: id,
      doctorUserId: user.id,
      ...body,
    });
    return toMedicalDocumentResponse(doc);
  }

  @Post('documents/:id/sign')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.DOCTOR)
  @Auditable({ action: 'document.signed', resource: 'MedicalDocument' })
  @ApiOperation({
    summary: 'Sign a draft document',
    description: 'Idempotent — re-signing an already-signed document returns the same row. Triggers synchronous PDF rendering and storage.',
    operationId: 'signDocument',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: MedicalDocumentResponseDto })
  @ApiStandardErrors()
  async sign(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MedicalDocumentResponseDto> {
    const doc = await this.service.sign(id);
    return toMedicalDocumentResponse(doc);
  }

  @Get('documents/:id/pdf')
  @AuditViewAccess('MedicalDocument')
  @ApiOperation({
    summary: 'Obtain a signed download URL for the document PDF',
    operationId: 'getDocumentPdfUrl',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: DownloadUrlResponseDto })
  @ApiStandardErrors()
  pdf(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DownloadUrlResponseDto> {
    return this.service.getPdfUrl(id);
  }
}
