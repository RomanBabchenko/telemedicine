import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from '@livekit/components-react';
import { Track, VideoPreset } from 'livekit-client';
import dayjs from 'dayjs';
import { bookingApi, consultationApi } from '@telemed/api-client';
import { Alert, Button, Card, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const consultation = consultationApi(apiClient);
const booking = bookingApi(apiClient);

// Mirror ConsultationService.issueJoinToken — UI phases flip on the same
// boundaries as the backend gate.
const JOIN_OPENS_BEFORE_START_MIN = 15;
const JOIN_CLOSES_AFTER_END_MIN = 30;

const formatUntil = (targetMs: number, nowMs: number): string => {
  const totalMinutes = Math.max(0, Math.ceil((targetMs - nowMs) / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} хв`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes ? `${hours} год ${minutes} хв` : `${hours} год`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days} дн ${remHours} год` : `${days} дн`;
};

const VideoGrid = () => {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  return (
    <GridLayout tracks={tracks} style={{ height: 'calc(100vh - 320px)' }}>
      <ParticipantTile />
    </GridLayout>
  );
};

/**
 * Resolve the LiveKit websocket URL the *browser* should use.
 *
 * Why we don't trust the URL the API returns:
 *   - The backend reads `LIVEKIT_URL` from .env, which is typically
 *     `ws://localhost:7880`. That's fine when both the browser and the
 *     LiveKit server live on the same machine, but it breaks the moment
 *     someone opens the cabinet from a phone on the LAN — for the phone
 *     "localhost" is the phone itself, not the dev box.
 *
 * Strategy:
 *   1. If the page is loaded from localhost, keep the API-provided URL.
 *   2. Otherwise (LAN IP / hostname), rewrite the host to whatever the
 *      browser used to fetch the page, on the LiveKit ws port.
 *   3. `VITE_LIVEKIT_URL` overrides everything for production deploys.
 */
const resolveLiveKitUrl = (apiProvidedUrl: string): string => {
  const envOverride = import.meta.env.VITE_LIVEKIT_URL as string | undefined;
  if (envOverride) return envOverride;
  if (typeof window === 'undefined') return apiProvidedUrl;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return apiProvidedUrl;
  const isHttps = window.location.protocol === 'https:';
  return `${isHttps ? 'wss' : 'ws'}://${host}:7880`;
};

export const ConsultationPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disconnectReason, setDisconnectReason] = useState<string | null>(null);
  const isInviteScope = useAuthStore((s) => s.user?.scope === 'invite');

  // LiveKit's CSS variables (--lk-bg / --lk-fg / etc.) only kick in when an
  // ancestor has data-lk-theme. Their device-pickers render through React
  // portals straight into <body>, so the attribute has to live on body to
  // cover them. Without this the camera/mic dropdown shows as transparent
  // background + black text on top of the dark video.
  useEffect(() => {
    document.body.setAttribute('data-lk-theme', 'default');
    return () => document.body.removeAttribute('data-lk-theme');
  }, []);

  const sessionQ = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => consultation.getById(sessionId!),
    enabled: !!sessionId,
  });

  // Second hop — we need the appointment's startAt/endAt to render the
  // time-gate phase. The session itself doesn't carry them, and duplicating
  // the fields into ConsultationSessionDto felt like ORM bleed into the API
  // contract. @InviteAccessible('appointmentId') already allows this call for
  // invite-scoped doctors because the id matches inviteCtx.appointmentId.
  const apptQ = useQuery({
    queryKey: ['appointment', sessionQ.data?.appointmentId],
    queryFn: () => booking.getById(sessionQ.data!.appointmentId),
    enabled: !!sessionQ.data?.appointmentId,
  });

  // Tick every 30 s — drives the phase transition and the countdown string.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const joinWindow = useMemo(() => {
    const a = apptQ.data;
    if (!a) return null;
    const start = new Date(a.startAt).getTime();
    const end = new Date(a.endAt).getTime();
    return {
      start,
      end,
      opensAt: start - JOIN_OPENS_BEFORE_START_MIN * 60_000,
      closesAt: end + JOIN_CLOSES_AFTER_END_MIN * 60_000,
    };
  }, [apptQ.data]);

  const phase: 'loading' | 'too_early' | 'can_join' | 'too_late' = !joinWindow
    ? 'loading'
    : nowMs < joinWindow.opensAt
      ? 'too_early'
      : nowMs > joinWindow.closesAt
        ? 'too_late'
        : 'can_join';

  const tokenM = useMutation({
    mutationFn: () => consultation.joinToken(sessionId!),
    onSuccess: () => setJoined(true),
    onError: (e: Error) => setError(e.message),
  });

  // Invite-scoped doctors (coming from MIS) don't run the documentation flow
  // inside our app — the MIS owns conclusions/prescriptions/referrals. They
  // just need a way to close the session and move the appointment to
  // COMPLETED when the call is over.
  const endM = useMutation({
    mutationFn: () => consultation.end(sessionId!),
    onSuccess: () => {
      setJoined(false);
      setDisconnectReason('Консультацію завершено');
    },
    onError: (e: Error) => setError(e.message),
  });

  const livekitUrl = useMemo(
    () => (tokenM.data ? resolveLiveKitUrl(tokenM.data.livekitUrl) : ''),
    [tokenM.data],
  );

  if (sessionQ.isLoading || apptQ.isLoading || phase === 'loading') {
    return <Spinner />;
  }

  if (phase === 'too_late') {
    return (
      <div className="space-y-6">
        <PageHeader title="Зустріч завершено" />
        <Card>
          <Alert variant="info">Час зустрічі вичерпано.</Alert>
        </Card>
      </div>
    );
  }

  if (phase === 'too_early' && joinWindow && apptQ.data) {
    const startLabel = dayjs(apptQ.data.startAt).format('DD.MM.YYYY о HH:mm');
    return (
      <div className="space-y-6">
        <PageHeader title="Зустріч заплановано" />
        <Card>
          <Alert variant="info" title={`Зустріч: ${startLabel}`}>
            До початку залишилось <strong>{formatUntil(joinWindow.opensAt, nowMs)}</strong>.
            Консультаційна кімната відкриється за {JOIN_OPENS_BEFORE_START_MIN} хвилин
            до початку.
          </Alert>
        </Card>
      </div>
    );
  }

  if (!joined || !tokenM.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Підготовка до консультації" />
        <Card>
          <Alert variant="info" title="Перед стартом">
            Перевірте мікрофон і камеру. Натисніть кнопку, щоб увійти в кімнату.
          </Alert>
          {error ? <Alert variant="danger">{error}</Alert> : null}
          <div className="mt-4">
            <Button onClick={() => tokenM.mutate()} isLoading={tokenM.isPending}>
              Розпочати консультацію
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Консультація"
        actions={
          // Anonymous appointments have no Patient row, so the finish/
          // documentation flow (prescriptions/referrals) has nowhere to
          // attach — offer only the plain "end session" action even for a
          // doctor who opened the consultation from their dashboard.
          isInviteScope || apptQ.data?.isAnonymousPatient ? (
            <Button
              variant="outline"
              onClick={() => {
                if (window.confirm('Завершити консультацію?')) endM.mutate();
              }}
              isLoading={endM.isPending}
            >
              Завершити консультацію
            </Button>
          ) : (
            <Link to={`/consultation/${sessionId}/finish`}>
              <Button variant="outline">Завершити та оформити</Button>
            </Link>
          )
        }
      />
      {disconnectReason ? (
        <Alert variant="danger" title="З'єднання розірвано">
          {disconnectReason}. Перевірте мережу та натисніть «Розпочати консультацію» знову.
        </Alert>
      ) : null}
      <LiveKitRoom
        token={tokenM.data.token}
        serverUrl={livekitUrl}
        connect={true}
        video={true}
        audio={true}
        // Low-bandwidth defaults for unstable Wi-Fi:
        //   - cap publish bitrate so the encoder targets ~150 kbps video
        //   - use VP8 (more forgiving than H.264 with packet loss)
        //   - adaptiveStream resizes/lowers fps when subscribers can't keep up
        //   - dynacast pauses publishing layers nobody is watching
        options={{
          adaptiveStream: true,
          dynacast: true,
          publishDefaults: {
            videoCodec: 'vp8',
            videoSimulcastLayers: [
              new VideoPreset(320, 180, 150_000, 15),
              new VideoPreset(640, 360, 400_000, 20),
            ],
          },
        }}
        onError={(e) => setDisconnectReason(e.message)}
        onDisconnected={(reason) => {
          // Don't auto-redirect — show the user what happened so they can
          // retry. Auto-navigating to /finish on a connection failure made
          // the page look like it skipped the call entirely.
          setDisconnectReason(reason ? `disconnected: ${reason}` : 'disconnected');
          setJoined(false);
        }}
      >
        <VideoGrid />
        <RoomAudioRenderer />
        <ControlBar />
      </LiveKitRoom>
    </div>
  );
};
