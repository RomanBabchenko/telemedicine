import type { AppointmentFeedbackDto, SubmitFeedbackDto } from '@telemed/shared-types';
import type { ApiClient } from '../http';

// Post-consultation patient feedback. `submit` is invite-accessible (the
// patient answers from the video page right after the doctor ends the call).
export const feedbackApi = (client: ApiClient) => ({
  submit: (appointmentId: string, dto: SubmitFeedbackDto) =>
    client.post<AppointmentFeedbackDto>(`/appointments/${appointmentId}/feedback`, dto),
});
