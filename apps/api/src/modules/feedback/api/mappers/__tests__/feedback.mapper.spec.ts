import type { AppointmentFeedback } from '../../../domain/entities/appointment-feedback.entity';
import { toFeedbackResponse, toFeedbackSummary } from '../feedback.mapper';

const row = {
  id: 'f-1',
  tenantId: 't',
  appointmentId: 'a-1',
  consultationSessionId: 's-1',
  doctorId: 'd-1',
  patientId: null,
  resolved: 'NO',
  clarityRating: 1,
  submittedByUserId: null,
  submittedScope: 'invite-anon',
  submittedAt: new Date('2026-09-22T09:30:00Z'),
} as unknown as AppointmentFeedback;

describe('feedback mapper', () => {
  it('summary exposes only the three admin-list fields with an ISO timestamp', () => {
    expect(toFeedbackSummary(row)).toEqual({
      resolved: 'NO',
      clarityRating: 1,
      submittedAt: '2026-09-22T09:30:00.000Z',
    });
  });

  it('response adds the appointment id and nothing about the submitter', () => {
    const dto = toFeedbackResponse(row);
    expect(dto).toEqual({
      appointmentId: 'a-1',
      resolved: 'NO',
      clarityRating: 1,
      submittedAt: '2026-09-22T09:30:00.000Z',
    });
    expect(dto).not.toHaveProperty('submittedByUserId');
    expect(dto).not.toHaveProperty('submittedScope');
  });
});
