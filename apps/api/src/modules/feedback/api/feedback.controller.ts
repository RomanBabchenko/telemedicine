import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
import { AppointmentSource, Role, isMisScopedActor } from '@telemed/shared-types';
import { AuthUser, CurrentUser, InviteAccessible, Roles } from '../../../common/auth/decorators';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { RequireFeature } from '../../../common/tenant/decorators';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { AppointmentService } from '../../booking/application/appointment.service';
import { FeedbackService } from '../application/feedback.service';
import { AppointmentFeedbackResponseDto, SubmitFeedbackBodyDto } from './dto';
import { toFeedbackResponse } from './mappers/feedback.mapper';

@ApiTags('feedback')
@Controller('appointments')
@UseGuards(RolesGuard)
@ApiAuth()
export class FeedbackController {
  constructor(
    private readonly service: FeedbackService,
    // BookingModule is @Global, so no module import is needed here.
    private readonly appointments: AppointmentService,
  ) {}

  @Post(':id/feedback')
  @HttpCode(HttpStatus.CREATED)
  // Invite-link patients (named or anonymous) answer from the video page —
  // the guard pins them to their own appointment id.
  @InviteAccessible('appointmentId')
  @RequireFeature('patientFeedback')
  @Roles(Role.PATIENT)
  @Auditable({ action: 'appointment.feedback.submitted', resource: 'AppointmentFeedback' })
  @ApiOperation({
    summary: 'Submit the post-consultation patient feedback',
    description:
      "Two answers: «Чи вирішено ваше питання?» (YES/PARTIALLY/NO) and «Наскільки зрозуміло лікар пояснив?» (1..5). One answer per appointment — a repeat returns 409 'feedback.already_submitted'. Accepted only after the doctor ended the call (409 'feedback.consultation_not_ended' otherwise). Requires the patientFeedback module.",
    operationId: 'submitAppointmentFeedback',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Appointment id' })
  @ApiBody({ type: SubmitFeedbackBodyDto })
  @ApiCreatedResponse({ type: AppointmentFeedbackResponseDto })
  @ApiStandardErrors()
  async submit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SubmitFeedbackBodyDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AppointmentFeedbackResponseDto> {
    const row = await this.service.submit(id, user, body);
    return toFeedbackResponse(row);
  }

  // Deliberately NOT feature-gated: answers collected while the module was
  // on stay readable after a clinic switches it off.
  @Get(':id/feedback')
  @Roles(
    Role.CLINIC_ADMIN,
    Role.PLATFORM_SUPER_ADMIN,
    Role.INTEGRATION_ADMIN,
    Role.CHIEF_MEDICAL_OFFICER,
  )
  @ApiOperation({
    summary: "Fetch the patient's feedback for an appointment (admin console)",
    description:
      'Admin-console roles only — never exposed to doctors or patients. INTEGRATION_ADMIN may only read feedback of MIS-originated appointments. 404 when the patient has not answered.',
    operationId: 'getAppointmentFeedback',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Appointment id' })
  @ApiOkResponse({ type: AppointmentFeedbackResponseDto })
  @ApiStandardErrors()
  async getForAppointment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<AppointmentFeedbackResponseDto> {
    if (isMisScopedActor(user.roles)) {
      const appt = await this.appointments.getById(id);
      if (appt.source !== AppointmentSource.MIS) {
        throw new ForbiddenException(
          'INTEGRATION_ADMIN may only access MIS-originated appointments',
        );
      }
    }
    const row = await this.service.findByAppointmentId(id);
    if (!row) throw new NotFoundException('Feedback not found');
    return toFeedbackResponse(row);
  }
}
