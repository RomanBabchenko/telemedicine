import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';
import { CurrentUser, AuthUser, Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable, AuditViewAccess } from '../../../common/audit/decorators';
import { DocumentationService } from '../application/documentation.service';
import { CreateConclusionBodyDto } from './dto';

@ApiTags('documents')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentationController {
  constructor(private readonly service: DocumentationService) {}

  @Get('appointments/:id/documents')
  @AuditViewAccess('MedicalDocument')
  list(@Param('id') id: string) {
    return this.service.listForAppointment(id);
  }

  @Post('appointments/:id/documents/conclusion')
  @Roles(Role.DOCTOR)
  @Auditable({ action: 'document.created', resource: 'MedicalDocument', captureBody: true })
  createConclusion(
    @Param('id') id: string,
    @Body() body: CreateConclusionBodyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createConclusion({
      appointmentId: id,
      doctorUserId: user.id,
      ...body,
    });
  }

  @Post('documents/:id/sign')
  @Roles(Role.DOCTOR)
  @Auditable({ action: 'document.signed', resource: 'MedicalDocument' })
  sign(@Param('id') id: string) {
    return this.service.sign(id);
  }

  @Get('documents/:id/pdf')
  @AuditViewAccess('MedicalDocument')
  pdf(@Param('id') id: string) {
    return this.service.getPdfUrl(id);
  }
}
