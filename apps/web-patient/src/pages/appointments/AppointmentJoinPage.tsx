import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from '@livekit/components-react';
import { DisconnectReason, Track, VideoPreset } from 'livekit-client';
import dayjs from 'dayjs';
import { bookingApi, consultationApi } from '@telemed/api-client';
import { Alert, Button, Card, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const booking = bookingApi(apiClient);
const consultation = consultationApi(apiClient);

// Must mirror the backend gate in ConsultationService.issueJoinToken —
// UI phases flip on the same boundaries so users don't hit a 403 surprise.
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

const VideoGrid = ({ isFullscreen }: { isFullscreen: boolean }) => {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  return (
    <GridLayout
      tracks={tracks}
      style={{ height: isFullscreen ? 'calc(100vh - 80px)' : 'calc(100vh - 320px)' }}
    >
      <ParticipantTile />
    </GridLayout>
  );
};

/**
 * Resolve LiveKit ws URL for the browser. See ConsultationPage.tsx in
 * web-doctor for the rationale — same logic, mirrored here.
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

export const AppointmentJoinPage = () => {
  const { id } = useParams<{ id: string }>();
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disconnectReason, setDisconnectReason] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fsContainerRef = useRef<HTMLDivElement>(null);

  // Sync local state when the user exits fullscreen via ESC or the browser UI
  // — without this listener the icon/label on the toggle button would lie.
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void fsContainerRef.current?.requestFullscreen();
    }
  };

  // LiveKit's CSS variables (--lk-bg / --lk-fg / etc.) only kick in when an
  // ancestor has data-lk-theme. Their device-pickers render through React
  // portals straight into <body>, so the attribute has to live on body to
  // cover them. Without this the camera/mic dropdown shows as transparent
  // background + black text on top of the dark video.
  useEffect(() => {
    document.body.setAttribute('data-lk-theme', 'default');
    return () => document.body.removeAttribute('data-lk-theme');
  }, []);

  const apptQ = useQuery({
    queryKey: ['appointment', id],
    queryFn: () => booking.getById(id!),
    enabled: !!id,
    // Poll while we're waiting for the clinic to mark the MIS prepayment as
    // paid — so the "payment required" screen flips to "connect" without the
    // user having to refresh the tab.
    refetchInterval: (query) => {
      const d = query.state.data;
      return d?.misPaymentType === 'prepaid' && d?.misPaymentStatus !== 'paid'
        ? 15_000
        : false;
    },
  });

  const paymentRequired =
    apptQ.data?.misPaymentType === 'prepaid' &&
    apptQ.data?.misPaymentStatus !== 'paid';

  // Tick every 30 s so the phase and the countdown text stay fresh without
  // hammering React-Query. Not tied to any query state — pure clock.
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
    mutationFn: async () => {
      const a = apptQ.data;
      if (!a?.consultationSessionId) throw new Error('Сесію ще не створено');
      return consultation.joinToken(a.consultationSessionId);
    },
    onSuccess: () => {
      // Clear any leftover disconnect alert from the previous attempt —
      // otherwise a stale "Connection lost" stays visible after a
      // successful rejoin.
      setDisconnectReason(null);
      setJoined(true);
    },
    onError: (e: Error) => setError(e.message),
  });

  const livekitUrl = useMemo(
    () => (tokenM.data ? resolveLiveKitUrl(tokenM.data.livekitUrl) : ''),
    [tokenM.data],
  );

  if (apptQ.isLoading || phase === 'loading') return <Spinner />;

  if (phase === 'too_late') {
    return (
      <div className="space-y-6">
        <PageHeader title="Зустріч завершено" />
        <Card>
          <Alert variant="info">
            Час зустрічі вичерпано. Якщо у вас залишились питання — зверніться
            до клініки.
          </Alert>
        </Card>
      </div>
    );
  }

  // Payment warning has priority over the time-gate: if the patient is
  // blocked by prepaid/unpaid, we want them to know *now* (possibly days
  // before startAt) so they have time to sort it out with the clinic. The
  // countdown is still shown as secondary info.
  if (paymentRequired && apptQ.data) {
    const startLabel = dayjs(apptQ.data.startAt).format('DD.MM.YYYY о HH:mm');
    const countdown =
      phase === 'too_early' && joinWindow
        ? ` До початку зустрічі залишилось ${formatUntil(joinWindow.opensAt, nowMs)}.`
        : '';
    return (
      <div className="space-y-6">
        <PageHeader title="Очікування оплати" />
        <Card>
          <Alert variant="warning" title="Оплату не завершено">
            Ваша зустріч запланована на <strong>{startLabel}</strong>.{countdown}
            {' '}Будь ласка, зверніться до клініки для завершення оплати —
            без цього підключення до відеоконсультації буде недоступне.
          </Alert>
          <div className="mt-4">
            <Button
              variant="outline"
              onClick={() => apptQ.refetch()}
              isLoading={apptQ.isFetching}
            >
              Оновити статус
            </Button>
          </div>
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
          <Alert variant="info" title={`Ваша зустріч: ${startLabel}`}>
            До початку залишилось <strong>{formatUntil(joinWindow.opensAt, nowMs)}</strong>.
            Кнопка підключення з'явиться за {JOIN_OPENS_BEFORE_START_MIN} хвилин
            до початку — повертайтесь ближче до цього часу.
          </Alert>
        </Card>
      </div>
    );
  }

  if (!joined || !tokenM.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Зала очікування" description="Підготуйте мікрофон та камеру" />
        <Card>
          <Alert variant="info" title="Інструкції">
            Натисніть кнопку нижче, щоб під'єднатись до відеоконсультації. Лікар бачитиме, що ви онлайн.
          </Alert>
          {error ? <Alert variant="danger">{error}</Alert> : null}
          <div className="mt-4">
            <Button onClick={() => tokenM.mutate()} isLoading={tokenM.isPending}>
              Підключитись
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Консультація" />
      {disconnectReason ? (
        <Alert variant="danger" title="З'єднання розірвано">
          {disconnectReason}. Перевірте мережу та натисніть «Підключитись» знову.
        </Alert>
      ) : null}
      <div ref={fsContainerRef} className="relative bg-black">
        <button
          type="button"
          onClick={toggleFullscreen}
          className="absolute right-2 top-2 z-10 rounded bg-black/60 px-3 py-1.5 text-sm text-white hover:bg-black/80"
        >
          {isFullscreen ? 'Звичайний режим' : 'На весь екран'}
        </button>
        <LiveKitRoom
          token={tokenM.data.token}
          serverUrl={livekitUrl}
          connect={true}
          video={true}
          audio={true}
          // Low-bandwidth defaults — see ConsultationPage.tsx in web-doctor.
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
          onConnected={() => setDisconnectReason(null)}
          onError={(e) => setDisconnectReason(e.message)}
          onDisconnected={(reason) => {
            // CLIENT_INITIATED fires for intentional disconnects (Leave
            // button, page navigation, React StrictMode double-mount in
            // dev). Skip the alert in that case — the connection didn't
            // actually fail, so showing "Connection lost" misleads the user.
            if (reason !== DisconnectReason.CLIENT_INITIATED) {
              setDisconnectReason(reason ? `disconnected: ${reason}` : 'disconnected');
            }
            setJoined(false);
          }}
        >
          <VideoGrid isFullscreen={isFullscreen} />
          <RoomAudioRenderer />
          <ControlBar />
        </LiveKitRoom>
      </div>
    </div>
  );
};
