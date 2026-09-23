import { ConflictException, ForbiddenException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AppointmentStatus, ConsultationStatus, Role } from '@telemed/shared-types';
import type { AuthUser } from '../../../common/auth/decorators';
import { FeedbackService } from '../application/feedback.service';
import type { AppointmentFeedback } from '../domain/entities/appointment-feedback.entity';

const TENANT = 't-1';
const APPT = 'a-1';
const SESSION = 's-1';

const fullPatient = (id = 'u-patient'): AuthUser =>
  ({
    id,
    email: 'p@x.test',
    phone: null,
    roles: [Role.PATIENT],
    tenantId: TENANT,
    mfaEnabled: false,
    scope: 'full',
  }) as AuthUser;

const invitePatient = (
  appointmentId = APPT,
  scope: 'invite' | 'invite-anon' = 'invite',
): AuthUser =>
  ({
    id: scope === 'invite-anon' ? 'invite-pseudonym' : 'u-invited',
    email: null,
    phone: null,
    roles: [Role.PATIENT],
    tenantId: TENANT,
    mfaEnabled: false,
    scope,
    inviteCtx: { appointmentId, consultationSessionId: SESSION },
  }) as AuthUser;

const doctor = (): AuthUser =>
  ({
    id: 'u-doc',
    email: 'd@x.test',
    phone: null,
    roles: [Role.DOCTOR],
    tenantId: TENANT,
    mfaEnabled: false,
    scope: 'full',
  }) as AuthUser;

const BODY = { resolved: 'YES' as const, clarityRating: 4 as const };

const build = (opts?: {
  status?: AppointmentStatus;
  sessionStatus?: ConsultationStatus | null;
  patientId?: string | null;
  existing?: Partial<AppointmentFeedback> | null;
  saveError?: unknown;
}) => {
  const appt = {
    id: APPT,
    tenantId: TENANT,
    doctorId: 'doc-1',
    patientId: opts?.patientId === undefined ? 'pat-1' : opts.patientId,
    consultationSessionId: SESSION,
    status: opts?.status ?? AppointmentStatus.COMPLETED,
  };
  const saved: AppointmentFeedback[] = [];
  const feedbacks = {
    findOne: jest.fn().mockResolvedValue(opts?.existing ?? null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((data: Partial<AppointmentFeedback>) => ({ ...data }) as AppointmentFeedback),
    save: jest.fn(async (row: AppointmentFeedback) => {
      if (opts?.saveError) throw opts.saveError;
      saved.push(row);
      return { ...row, id: 'f-1' };
    }),
  };
  const sessions = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        opts?.sessionStatus === null
          ? null
          : { id: SESSION, status: opts?.sessionStatus ?? ConsultationStatus.ENDED },
      ),
  };
  const patients = {
    findOne: jest.fn(async ({ where }: { where: { userId: string } }) =>
      where.userId === 'u-patient' ? { id: 'pat-1', userId: 'u-patient' } : null,
    ),
  };
  const appointments = { getById: jest.fn().mockResolvedValue(appt) };
  const tenantContext = { getTenantId: () => TENANT };
  const service = new FeedbackService(
    feedbacks as never,
    sessions as never,
    patients as never,
    appointments as never,
    tenantContext as never,
  );
  return { service, feedbacks, sessions, patients, saved };
};

describe('FeedbackService.submit', () => {
  it('stores the answers for a completed appointment (full-scope patient)', async () => {
    const { service, saved } = build();
    const row = await service.submit(APPT, fullPatient(), BODY);
    expect(row.id).toBe('f-1');
    expect(saved[0]).toMatchObject({
      tenantId: TENANT,
      appointmentId: APPT,
      consultationSessionId: SESSION,
      doctorId: 'doc-1',
      patientId: 'pat-1',
      resolved: 'YES',
      clarityRating: 4,
      submittedByUserId: 'u-patient',
      submittedScope: 'full',
    });
    expect(saved[0].submittedAt).toBeInstanceOf(Date);
  });

  it('invite-anon: pseudonym is NOT persisted as submittedByUserId', async () => {
    const { service, saved } = build({ patientId: null });
    await service.submit(APPT, invitePatient(APPT, 'invite-anon'), BODY);
    expect(saved[0]).toMatchObject({
      submittedByUserId: null,
      submittedScope: 'invite-anon',
      patientId: null,
    });
  });

  it('named invite: user id is persisted with scope invite', async () => {
    const { service, saved } = build();
    await service.submit(APPT, invitePatient(), BODY);
    expect(saved[0]).toMatchObject({ submittedByUserId: 'u-invited', submittedScope: 'invite' });
  });

  it('409 feedback.already_submitted on a repeat', async () => {
    const { service, feedbacks } = build({ existing: { id: 'f-0' } });
    await expect(service.submit(APPT, fullPatient(), BODY)).rejects.toMatchObject({
      constructor: ConflictException,
      response: { code: 'feedback.already_submitted' },
    });
    expect(feedbacks.save).not.toHaveBeenCalled();
  });

  it('409 feedback.already_submitted when the unique index fires on insert (race)', async () => {
    const driverError = Object.assign(new Error('duplicate key'), { code: '23505' });
    const { service } = build({ saveError: new QueryFailedError('INSERT', [], driverError) });
    await expect(service.submit(APPT, fullPatient(), BODY)).rejects.toMatchObject({
      constructor: ConflictException,
      response: { code: 'feedback.already_submitted' },
    });
  });

  it('other DB errors propagate untouched', async () => {
    const boom = new Error('connection reset');
    const { service } = build({ saveError: boom });
    await expect(service.submit(APPT, fullPatient(), BODY)).rejects.toBe(boom);
  });

  it('403 for a doctor', async () => {
    const { service, feedbacks } = build();
    await expect(service.submit(APPT, doctor(), BODY)).rejects.toBeInstanceOf(ForbiddenException);
    expect(feedbacks.save).not.toHaveBeenCalled();
  });

  it("403 for a full-scope patient who is not this appointment's patient", async () => {
    const { service } = build();
    await expect(service.submit(APPT, fullPatient('u-other'), BODY)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('403 for an invite holder of a different appointment', async () => {
    const { service } = build();
    await expect(service.submit(APPT, invitePatient('a-other'), BODY)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('409 feedback.consultation_not_ended while the session is still ACTIVE', async () => {
    const { service } = build({
      status: AppointmentStatus.IN_PROGRESS,
      sessionStatus: ConsultationStatus.ACTIVE,
    });
    await expect(service.submit(APPT, fullPatient(), BODY)).rejects.toMatchObject({
      constructor: ConflictException,
      response: { code: 'feedback.consultation_not_ended' },
    });
  });

  it('accepts when the session is ENDED even if the appointment is still IN_PROGRESS', async () => {
    const { service, saved } = build({
      status: AppointmentStatus.IN_PROGRESS,
      sessionStatus: ConsultationStatus.ENDED,
    });
    await service.submit(APPT, fullPatient(), BODY);
    expect(saved).toHaveLength(1);
  });

  it('accepts a COMPLETED appointment without consulting the session', async () => {
    const { service, sessions } = build({ status: AppointmentStatus.COMPLETED });
    await service.submit(APPT, fullPatient(), BODY);
    expect(sessions.findOne).not.toHaveBeenCalled();
  });
});

describe('FeedbackService lookups', () => {
  it('findByAppointmentIds returns a map keyed by appointment id', async () => {
    const { service, feedbacks } = build();
    feedbacks.find.mockResolvedValue([
      { appointmentId: 'a-1', clarityRating: 5 },
      { appointmentId: 'a-2', clarityRating: 2 },
    ]);
    const map = await service.findByAppointmentIds(['a-1', 'a-2']);
    expect(map.get('a-2')).toMatchObject({ clarityRating: 2 });
  });

  it('findByAppointmentIds skips the query for an empty input', async () => {
    const { service, feedbacks } = build();
    const map = await service.findByAppointmentIds([]);
    expect(map.size).toBe(0);
    expect(feedbacks.find).not.toHaveBeenCalled();
  });
});
