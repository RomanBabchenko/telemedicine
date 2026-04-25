import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ControlBar,
  GridLayout,
  LayoutContextProvider,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  usePinnedTracks,
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

// Switches between the regular grid and a custom focus layout when a tile is
// pinned. The small icon on each ParticipantTile (FocusToggle, hover to
// reveal) dispatches into the layout context, and we read it via
// usePinnedTracks. Same mechanism handles screen share — pinning a screen
// share track puts it in the main area.
//
// We avoid LiveKit's FocusLayoutContainer/CarouselLayout because their
// auto-sized side carousel sometimes stuck at --lk-max-visible-tiles=1 (when
// the resize observer's first read happened on a 0×0 mount), which made the
// single thumbnail fill the whole column and overflow horizontally with its
// 16/10 aspect ratio. Our overlay layout has deterministic sizing.
const ConferenceLayout = ({ isFullscreen }: { isFullscreen: boolean }) => {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const pinned = usePinnedTracks();
  const focused = pinned[0] ?? null;
  const height = isFullscreen ? 'calc(100vh - 80px)' : 'calc(100vh - 320px)';
  const focusContainerRef = useRef<HTMLDivElement>(null);
  const [panelVisible, setPanelVisible] = useState(true);

  // In fullscreen we auto-hide the thumbnail strip after a short idle so it
  // doesn't sit on top of the focused video; any pointer/key activity inside
  // the conference area brings it back. Outside fullscreen we leave it
  // permanently visible — there's plenty of room and no need to hide it.
  useEffect(() => {
    if (!focused || !isFullscreen) {
      setPanelVisible(true);
      return;
    }
    const el = focusContainerRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ping = () => {
      setPanelVisible(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setPanelVisible(false), 2500);
    };
    ping();
    el.addEventListener('mousemove', ping);
    el.addEventListener('keydown', ping);
    return () => {
      el.removeEventListener('mousemove', ping);
      el.removeEventListener('keydown', ping);
      if (timer) clearTimeout(timer);
    };
  }, [focused, isFullscreen]);

  if (focused) {
    const carousel = tracks.filter(
      (t) =>
        !(
          t.participant.identity === focused.participant.identity &&
          t.source === focused.source
        ),
    );
    return (
      <div ref={focusContainerRef} className="relative overflow-hidden bg-black" style={{ height }}>
        <ParticipantTile trackRef={focused} className="h-full w-full" />
        <div
          className={`absolute bottom-2 left-2 top-2 z-10 flex flex-col gap-2 overflow-y-auto pr-1 transition-all duration-300 ${
            panelVisible
              ? 'translate-x-0 opacity-100'
              : 'pointer-events-none -translate-x-[calc(100%+0.5rem)] opacity-0'
          }`}
        >
          {carousel.map((t) => (
            <div
              key={`${t.participant.identity}-${t.source}`}
              className="aspect-video w-[180px] flex-shrink-0 overflow-hidden rounded-md shadow-lg"
            >
              <ParticipantTile trackRef={t} className="h-full w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <GridLayout tracks={tracks} style={{ height }}>
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

  // Disable browser PiP on every <video> rendered by LiveKit. We have our own
  // FocusLayout for "make this participant fill the window", and the native
  // PiP button on hover only added confusion next to the FocusToggle icon.
  // LiveKit mounts tiles dynamically as participants join, so we watch the
  // container with a MutationObserver instead of a one-shot query.
  useEffect(() => {
    if (!joined) return;
    const container = fsContainerRef.current;
    if (!container) return;
    const disable = (v: HTMLVideoElement) => {
      v.disablePictureInPicture = true;
    };
    container.querySelectorAll('video').forEach(disable);
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (n instanceof HTMLVideoElement) disable(n);
          else if (n instanceof HTMLElement) n.querySelectorAll('video').forEach(disable);
        });
      }
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [joined]);

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
      <div ref={fsContainerRef} className="relative overflow-hidden rounded-lg bg-black">
        {/* Fullscreen toggle lives in the bottom control bar (next to LK
         * controls) instead of the top-right corner — top-right collided
         * with the per-tile FocusToggle icon LiveKit shows on hover. */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="lk-button absolute bottom-3 right-3 z-10"
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
          <LayoutContextProvider>
            <ConferenceLayout isFullscreen={isFullscreen} />
            <RoomAudioRenderer />
            <ControlBar />
          </LayoutContextProvider>
        </LiveKitRoom>
      </div>
    </div>
  );
};
