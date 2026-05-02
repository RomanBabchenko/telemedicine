import { QueryFailedError } from 'typeorm';
import { RecordingService } from '../application/recording.service';
import type { RecordingEgress } from '../domain/entities/recording-egress.entity';
import type { SessionRecording } from '../domain/entities/session-recording.entity';

interface FakeRecordingsState {
  rows: Map<string, SessionRecording>;
}

interface FakeEgressesState {
  rows: Map<string, RecordingEgress>; // key = id
}

function makeRecordingsRepo(state: FakeRecordingsState) {
  return {
    create: (data: Partial<SessionRecording>) => ({ ...data }) as SessionRecording,
    save: jest.fn(async (r: SessionRecording) => {
      if (!r.id) r.id = `rec-${state.rows.size + 1}`;
      state.rows.set(r.id, { ...r });
      return state.rows.get(r.id)!;
    }),
    findOne: jest.fn(async ({ where }: { where: Partial<SessionRecording> }) => {
      for (const r of state.rows.values()) {
        const matchSession = where.sessionId === undefined || r.sessionId === where.sessionId;
        const matchTenant = where.tenantId === undefined || r.tenantId === where.tenantId;
        const matchId = where.id === undefined || r.id === where.id;
        if (matchSession && matchTenant && matchId) return r;
      }
      return null;
    }),
  };
}

function makeEgressesRepo(state: FakeEgressesState) {
  let nextId = 0;
  let throwOnNextSave: 'unique-violation' | null = null;
  const repo = {
    create: (data: Partial<RecordingEgress>) => ({ ...data }) as RecordingEgress,
    save: jest.fn(async (r: RecordingEgress) => {
      if (throwOnNextSave === 'unique-violation') {
        throwOnNextSave = null;
        throw new QueryFailedError(
          'INSERT',
          [],
          new Error('duplicate key value violates unique constraint "uq_recording_egress_track"'),
        );
      }
      if (!r.id) r.id = `re-${++nextId}`;
      state.rows.set(r.id, { ...r });
      return state.rows.get(r.id)!;
    }),
    findOne: jest.fn(async ({ where }: { where: Partial<RecordingEgress> }) => {
      for (const r of state.rows.values()) {
        const matchRec = where.recordingId === undefined || r.recordingId === where.recordingId;
        const matchTrack = where.trackSid === undefined || r.trackSid === where.trackSid;
        const matchEgress = where.egressId === undefined || r.egressId === where.egressId;
        if (matchRec && matchTrack && matchEgress) return r;
      }
      return null;
    }),
    find: jest.fn(async ({ where }: { where: Partial<RecordingEgress> }) => {
      const out: RecordingEgress[] = [];
      for (const r of state.rows.values()) {
        const matchRec = where.recordingId === undefined || r.recordingId === where.recordingId;
        const matchStatus = where.status === undefined || r.status === where.status;
        if (matchRec && matchStatus) out.push(r);
      }
      return out;
    }),
    _throwOnNextSave(kind: 'unique-violation') {
      throwOnNextSave = kind;
    },
  };
  return repo;
}

function makeService(opts?: {
  listAudioTracks?: () => Promise<Array<{ identity: string; trackSid: string }>>;
  startEgress?: jest.Mock;
}) {
  const recordingsState: FakeRecordingsState = { rows: new Map() };
  const egressesState: FakeEgressesState = { rows: new Map() };
  const recordings = makeRecordingsRepo(recordingsState);
  const egresses = makeEgressesRepo(egressesState);

  const session = {
    id: 'sess-1',
    tenantId: 't-1',
    livekitRoomName: 'room-1',
    recordingId: null as string | null,
  };
  const sessions = {
    findOne: jest.fn(async () => session),
    save: jest.fn(async (s: typeof session) => s),
  };
  const consents = { findOne: jest.fn() };
  const tenants = { findOne: jest.fn() };
  const livekit = {
    listAudioTracks: jest.fn(opts?.listAudioTracks ?? (async () => [])),
    startAudioTrackEgress:
      opts?.startEgress ?? jest.fn(async () => ({ egressId: `eg-${Math.random()}` })),
    stopEgress: jest.fn(async () => undefined),
  };
  const minio = { presignedGet: jest.fn(async () => 'http://signed') };
  const tenantContext = { getTenantId: () => 't-1' };
  const queue = { add: jest.fn(async () => undefined) };

  const svc = new RecordingService(
    recordings as never,
    egresses as never,
    sessions as never,
    consents as never,
    tenants as never,
    livekit as never,
    minio as never,
    tenantContext as never,
    queue as never,
  );

  return {
    svc,
    recordings,
    egresses,
    sessions,
    livekit,
    minio,
    queue,
    session,
    recordingsState,
    egressesState,
  };
}

describe('RecordingService', () => {
  describe('startAuto', () => {
    it('creates a recording row and one egress per published audio track', async () => {
      const ctx = makeService({
        listAudioTracks: async () => [
          { identity: 'doctor-1', trackSid: 'TR_doctor' },
          { identity: 'patient-1', trackSid: 'TR_patient' },
        ],
      });

      const recording = await ctx.svc.startAuto('sess-1');

      expect(recording.status).toBe('RECORDING');
      expect(ctx.livekit.startAudioTrackEgress).toHaveBeenCalledTimes(2);
      expect(ctx.egressesState.rows.size).toBe(2);
      const trackSids = [...ctx.egressesState.rows.values()].map((e) => e.trackSid).sort();
      expect(trackSids).toEqual(['TR_doctor', 'TR_patient']);
      // session row got linked
      expect(ctx.session.recordingId).toBe(recording.id);
    });

    it('is idempotent: second call returns the same recording and re-runs catch-up', async () => {
      let tracks: Array<{ identity: string; trackSid: string }> = [
        { identity: 'doctor-1', trackSid: 'TR_doctor' },
      ];
      const ctx = makeService({ listAudioTracks: async () => tracks });

      const r1 = await ctx.svc.startAuto('sess-1');
      // patient joins after the first call
      tracks = [
        { identity: 'doctor-1', trackSid: 'TR_doctor' }, // already covered
        { identity: 'patient-1', trackSid: 'TR_patient' },
      ];
      const r2 = await ctx.svc.startAuto('sess-1');

      expect(r1.id).toBe(r2.id);
      // doctor egress not duplicated, patient egress added
      expect(ctx.egressesState.rows.size).toBe(2);
    });
  });

  describe('startOneTrackEgress idempotency', () => {
    it('returns existing row instead of double-starting (catch-up wins)', async () => {
      const ctx = makeService({
        listAudioTracks: async () => [{ identity: 'doctor-1', trackSid: 'TR_doctor' }],
      });

      await ctx.svc.startAuto('sess-1');
      // simulate webhook arriving for the same track AFTER catch-up
      await ctx.svc.handleTrackPublished('room-1', 'doctor-1', 'TR_doctor', 'AUDIO');

      // second startAudioTrackEgress should NOT have happened
      expect(ctx.livekit.startAudioTrackEgress).toHaveBeenCalledTimes(1);
      expect(ctx.egressesState.rows.size).toBe(1);
    });

    it('recovers from unique-violation race (webhook wrote first)', async () => {
      const ctx = makeService({
        listAudioTracks: async () => [{ identity: 'doctor-1', trackSid: 'TR_doctor' }],
      });
      // First save will throw — simulating concurrent INSERT from webhook.
      // The pre-existing row is what findOne should return after recovery.
      ctx.egressesState.rows.set('re-existing', {
        id: 're-existing',
        tenantId: 't-1',
        recordingId: 'rec-1',
        egressId: 'eg-existing',
        participantIdentity: 'doctor-1',
        trackSid: 'TR_doctor',
        objectKey: 'foo',
        status: 'RECORDING',
        durationSec: 0,
        startedAt: new Date(),
        endedAt: null,
      } as RecordingEgress);

      // No throw expected; svc finds the existing row via the initial findOne.
      const r = await ctx.svc.startAuto('sess-1');
      expect(r).toBeDefined();
      // No new row created
      expect(ctx.egressesState.rows.size).toBe(1);
      expect(ctx.livekit.startAudioTrackEgress).not.toHaveBeenCalled();
    });
  });

  describe('handleTrackPublished', () => {
    it('no-ops for VIDEO tracks', async () => {
      const ctx = makeService();
      await ctx.svc.handleTrackPublished('room-1', 'doctor-1', 'TR_video', 'VIDEO');
      expect(ctx.livekit.startAudioTrackEgress).not.toHaveBeenCalled();
    });

    it('no-ops when session has no active recording', async () => {
      const ctx = makeService();
      // session.recordingId is null → no recording lookup happens
      await ctx.svc.handleTrackPublished('room-1', 'doctor-1', 'TR_audio', 'AUDIO');
      expect(ctx.livekit.startAudioTrackEgress).not.toHaveBeenCalled();
    });

    it('starts a per-track egress when recording is active', async () => {
      const ctx = makeService();
      await ctx.svc.startAuto('sess-1'); // creates recording, no tracks yet
      ctx.livekit.startAudioTrackEgress.mockClear();

      await ctx.svc.handleTrackPublished('room-1', 'doctor-1', 'TR_late', 'AUDIO');

      expect(ctx.livekit.startAudioTrackEgress).toHaveBeenCalledTimes(1);
      expect(ctx.egressesState.rows.size).toBe(1);
    });
  });

  describe('handleEgressEnded + maybeScheduleMerge', () => {
    it('does not enqueue merge while siblings still RECORDING', async () => {
      const ctx = makeService({
        listAudioTracks: async () => [
          { identity: 'doctor-1', trackSid: 'TR_doctor' },
          { identity: 'patient-1', trackSid: 'TR_patient' },
        ],
      });
      await ctx.svc.startAuto('sess-1');
      const [first] = [...ctx.egressesState.rows.values()];

      await ctx.svc.handleEgressEnded(first.egressId, 60);

      expect(ctx.queue.add).not.toHaveBeenCalled();
      const recording = [...ctx.recordingsState.rows.values()][0];
      expect(recording.status).toBe('RECORDING');
    });

    it('enqueues merge and flips to MERGING when all siblings terminal', async () => {
      const ctx = makeService({
        listAudioTracks: async () => [
          { identity: 'doctor-1', trackSid: 'TR_doctor' },
          { identity: 'patient-1', trackSid: 'TR_patient' },
        ],
      });
      await ctx.svc.startAuto('sess-1');
      const all = [...ctx.egressesState.rows.values()];

      await ctx.svc.handleEgressEnded(all[0].egressId, 60);
      await ctx.svc.handleEgressEnded(all[1].egressId, 90);

      expect(ctx.queue.add).toHaveBeenCalledTimes(1);
      const recording = [...ctx.recordingsState.rows.values()][0];
      expect(recording.status).toBe('MERGING');
    });

    it('marks recording FAILED if every sibling failed', async () => {
      const ctx = makeService({
        listAudioTracks: async () => [
          { identity: 'doctor-1', trackSid: 'TR_doctor' },
          { identity: 'patient-1', trackSid: 'TR_patient' },
        ],
      });
      await ctx.svc.startAuto('sess-1');
      const all = [...ctx.egressesState.rows.values()];

      await ctx.svc.handleEgressEnded(all[0].egressId, null, true);
      await ctx.svc.handleEgressEnded(all[1].egressId, null, true);

      expect(ctx.queue.add).not.toHaveBeenCalled();
      const recording = [...ctx.recordingsState.rows.values()][0];
      expect(recording.status).toBe('FAILED');
    });

    it('schedules merge with at least one STORED even if others FAILED', async () => {
      const ctx = makeService({
        listAudioTracks: async () => [
          { identity: 'doctor-1', trackSid: 'TR_doctor' },
          { identity: 'patient-1', trackSid: 'TR_patient' },
        ],
      });
      await ctx.svc.startAuto('sess-1');
      const all = [...ctx.egressesState.rows.values()];

      await ctx.svc.handleEgressEnded(all[0].egressId, 60);
      await ctx.svc.handleEgressEnded(all[1].egressId, null, true);

      expect(ctx.queue.add).toHaveBeenCalledTimes(1);
    });

    it('idempotent: replayed egress_ended for STORED row is a no-op', async () => {
      const ctx = makeService({
        listAudioTracks: async () => [{ identity: 'doctor-1', trackSid: 'TR_doctor' }],
      });
      await ctx.svc.startAuto('sess-1');
      const [only] = [...ctx.egressesState.rows.values()];

      await ctx.svc.handleEgressEnded(only.egressId, 60);
      ctx.queue.add.mockClear();
      await ctx.svc.handleEgressEnded(only.egressId, 60);

      expect(ctx.queue.add).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('calls stopEgress on every in-flight egress', async () => {
      const ctx = makeService({
        listAudioTracks: async () => [
          { identity: 'doctor-1', trackSid: 'TR_doctor' },
          { identity: 'patient-1', trackSid: 'TR_patient' },
        ],
      });
      await ctx.svc.startAuto('sess-1');

      await ctx.svc.stop('sess-1');

      expect(ctx.livekit.stopEgress).toHaveBeenCalledTimes(2);
    });

    it('does not flip SessionRecording status (waits for webhooks)', async () => {
      const ctx = makeService({
        listAudioTracks: async () => [{ identity: 'doctor-1', trackSid: 'TR_doctor' }],
      });
      await ctx.svc.startAuto('sess-1');

      await ctx.svc.stop('sess-1');

      const recording = [...ctx.recordingsState.rows.values()][0];
      expect(recording.status).toBe('RECORDING');
    });
  });
});
