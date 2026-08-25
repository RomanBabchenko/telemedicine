import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AppointmentSource, Role } from '@telemed/shared-types';
import type { AuthUser } from '../../../common/auth/decorators';
import { RecordingController } from '../api/recording.controller';

const actor = (roles: Role[]): AuthUser =>
  ({ id: 'u', email: 'a@x.test', phone: null, roles, tenantId: 't', mfaEnabled: false }) as AuthUser;

const INFO = { status: 'STORED', durationSec: 10, downloadUrl: 'https://x/y.mp3' };

const build = () => {
  const service = { getRecordingInfo: jest.fn().mockResolvedValue(INFO) };
  const appointments = { findByConsultationSessionId: jest.fn() };
  const ctrl = new RecordingController(service as never, appointments as never);
  return { ctrl, service, appointments };
};

describe('GET /sessions/:id/recording — role scoping', () => {
  it('INTEGRATION_ADMIN is refused for a PLATFORM appointment session', async () => {
    const { ctrl, service, appointments } = build();
    appointments.findByConsultationSessionId.mockResolvedValue({ source: AppointmentSource.PLATFORM });
    await expect(ctrl.getRecording('s', actor([Role.INTEGRATION_ADMIN]))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.getRecordingInfo).not.toHaveBeenCalled();
  });

  it('INTEGRATION_ADMIN is refused when no appointment maps to the session', async () => {
    const { ctrl, appointments } = build();
    appointments.findByConsultationSessionId.mockResolvedValue(null);
    await expect(ctrl.getRecording('s', actor([Role.INTEGRATION_ADMIN]))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('INTEGRATION_ADMIN gets the recording of a MIS appointment', async () => {
    const { ctrl, appointments } = build();
    appointments.findByConsultationSessionId.mockResolvedValue({ source: AppointmentSource.MIS });
    await expect(ctrl.getRecording('s', actor([Role.INTEGRATION_ADMIN]))).resolves.toEqual(INFO);
  });

  it('CHIEF_MEDICAL_OFFICER is not source-scoped', async () => {
    const { ctrl, appointments } = build();
    await expect(ctrl.getRecording('s', actor([Role.CHIEF_MEDICAL_OFFICER]))).resolves.toEqual(INFO);
    expect(appointments.findByConsultationSessionId).not.toHaveBeenCalled();
  });

  it('404 when the recording does not exist', async () => {
    const { ctrl, service } = build();
    service.getRecordingInfo.mockResolvedValue(null);
    await expect(ctrl.getRecording('s', actor([Role.CLINIC_ADMIN]))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
