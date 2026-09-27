import { AppointmentFeedback } from '../../domain/entities/appointment-feedback.entity';
import {
  AppointmentFeedbackResponseDto,
  AppointmentFeedbackSummaryDto,
} from '../dto/appointment-feedback.response.dto';

export const toFeedbackSummary = (f: AppointmentFeedback): AppointmentFeedbackSummaryDto => ({
  resolved: f.resolved,
  clarityRating: f.clarityRating,
  submittedAt: f.submittedAt.toISOString(),
});

export const toFeedbackResponse = (f: AppointmentFeedback): AppointmentFeedbackResponseDto => ({
  appointmentId: f.appointmentId,
  ...toFeedbackSummary(f),
});
