import { NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@telemed/shared-types';
import { Appointment } from '../../../booking/domain/entities/appointment.entity';
import { MisAppointmentService } from '../mis-appointment.service';

const appt = (consultationSessionId: string | null): Appointment =>
  ({
    id: 'a-1',
    tenantId: 't-1',
    status: AppointmentStatus.CONFIRMED,
    consultationSessionId,
  }) as unknown as Appointment;

const build = (opts: {
  session: string | null;
  info?: unknown;
  disabled?: boolean;
}) => {
  const recordings = {
    getRecordingInfo: jest.fn().mockResolvedValue(opts.info ?? null),
    isRecordingDisabledForTenant: jest.fn().mockResolvedValue(opts.disabled ?? false),
  };
  const service = new MisAppointmentService(
    { findOne: jest.fn().mockResolvedValue(appt(opts.session)) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    recordings as never,
    {} as never,
    {} as never,
  );
  return { service, recordings };
};

const code = async (p: Promise<unknown>): Promise<string | undefined> => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(NotFoundException);
    return ((e as NotFoundException).getResponse() as { code?: string }).code;
  }
  throw new Error('expected rejection');
};

describe('MisAppointmentService.getRecording', () => {
  const locator = { kind: 'internal' as const, appointmentId: 'a-1' };

  it('returns the info when a recording row exists', async () => {
    const info = { recordingId: 'r-1', status: 'STORED', durationSec: 10, downloadUrl: 'u' };
    const { service } = build({ session: 's-1', info });
    await expect(service.getRecording('t-1', locator)).resolves.toEqual(info);
  });

  it('404 recording.disabled when the clinic has recording switched off', async () => {
    const { service, recordings } = build({ session: 's-1', disabled: true });
    expect(await code(service.getRecording('t-1', locator))).toBe('recording.disabled');
    expect(recordings.isRecordingDisabledForTenant).toHaveBeenCalledWith('t-1');
  });

  it('404 recording.not_found when recording is on but nothing was recorded yet', async () => {
    const { service } = build({ session: 's-1', disabled: false });
    expect(await code(service.getRecording('t-1', locator))).toBe('recording.not_found');
  });

  it('404 when the consultation session has not been created yet', async () => {
    const { service, recordings } = build({ session: null });
    await expect(service.getRecording('t-1', locator)).rejects.toBeInstanceOf(NotFoundException);
    expect(recordings.getRecordingInfo).not.toHaveBeenCalled();
  });
});
