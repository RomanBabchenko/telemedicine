import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { AppointmentStatus } from '@telemed/shared-types';
import { Alert, Button, Card, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { LobbyDeviceState, LobbyPreview } from './LobbyPreview';

const consultation = consultationApi(apiClient);
const booking = bookingApi(apiClient);

// Mirror ConsultationService.issueJoinToken — UI phases flip on the same
// boundaries as the backend gate.
const JOIN_OPENS_BEFORE_START_MIN = 15;
const JOIN_CLOSES_AFTER_END_MIN = 30;

// Mirrors TERMINAL_APPOINTMENT_STATUSES in ConsultationService — the
// join-token endpoint 403s with `consultation.terminal` for these. We
// short-circuit client-side so the doctor sees "session ended" instead of
// the "Розпочати консультацію" button leading to an obscure error.
const CANCELLED_STATUSES = new Set<AppointmentStatus>([
  AppointmentStatus.CANCELLED_BY_PATIENT,
  AppointmentStatus.CANCELLED_BY_PROVIDER,
  AppointmentStatus.NO_SHOW_PATIENT,
  AppointmentStatus.NO_SHOW_PROVIDER,
  AppointmentStatus.REFUNDED,
]);
const COMPLETED_STATUSES = new Set<AppointmentStatus>([
  AppointmentStatus.COMPLETED,
  AppointmentStatus.DOCUMENTATION_COMPLETED,
]);

// NestJS ForbiddenException({ message, code }) lands as
// { statusCode, message, code, ... } in axios's error.response.data.
// Fall back to the generic axios message only if the body is missing.
const extractApiMessage = (e: unknown, fallback: string): string => {
  const body = (e as { response?: { data?: { message?: unknown } } })?.response?.data;
  if (body && typeof body.message === 'string' && body.message.length > 0) {
    return body.message;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
};

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fsContainerRef = useRef<HTMLDivElement>(null);
  const isInviteScope = useAuthStore((s) => s.user?.scope === 'invite');

  // Pre-join device choices — see web-patient/.../AppointmentJoinPage.tsx.
  const [deviceState, setDeviceState] = useState<LobbyDeviceState>({
    cameraEnabled: true,
    micEnabled: true,
    videoDeviceId: undefined,
    audioDeviceId: undefined,
  });
  const updateDeviceState = (next: Partial<LobbyDeviceState>) =>
    setDeviceState((prev) => ({ ...prev, ...next }));

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
  // cover them. Only set it while we're actually in the call — applying it
  // in the lobby leaks LK's dark foreground into our native <select>
  // dropdowns (white-on-white option list).
  useEffect(() => {
    if (!joined) return;
    document.body.setAttribute('data-lk-theme', 'default');
    return () => document.body.removeAttribute('data-lk-theme');
  }, [joined]);

  const sessionQ = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => consultation.getById(sessionId!),
    enabled: !!sessionId,
    // Poll while in the lobby so the patient-presence indicator updates.
    // Once the doctor connects the LiveKit room exposes presence directly
    // and this server-side poll is no longer needed.
    refetchInterval: !joined ? 5_000 : false,
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
    onSuccess: () => {
      // Clear any leftover disconnect alert from the previous attempt —
      // otherwise a stale "Connection lost" stays visible after a
      // successful rejoin.
      setDisconnectReason(null);
      setJoined(true);
    },
    onError: (e: Error) =>
      setError(extractApiMessage(e, 'Не вдалося підключитись до зустрічі')),
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
      // Refetch so the terminal-state branch flips the page from the
      // "Розпочати консультацію" lobby straight to "Зустріч завершено".
      void apptQ.refetch();
    },
    onError: (e: Error) =>
      setError(extractApiMessage(e, 'Не вдалося завершити консультацію')),
  });

  const livekitUrl = useMemo(
    () => (tokenM.data ? resolveLiveKitUrl(tokenM.data.livekitUrl) : ''),
    [tokenM.data],
  );

  if (sessionQ.isLoading || apptQ.isLoading || phase === 'loading') {
    return <Spinner />;
  }

  // Terminal-state short-circuit — once cancelled/completed the join-token
  // endpoint will 403, so don't show "Розпочати консультацію" only to fail
  // on click. Mirrors backend's `consultation.terminal` gate.
  const apptStatus = apptQ.data?.status;
  if (apptStatus && CANCELLED_STATUSES.has(apptStatus)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Зустріч скасовано" />
        <Card>
          <Alert variant="info">
            Цю зустріч скасовано — підключення недоступне.
          </Alert>
        </Card>
      </div>
    );
  }
  if (apptStatus && COMPLETED_STATUSES.has(apptStatus)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Зустріч завершено" />
        <Card>
          <Alert variant="info">
            Цю зустріч уже завершено — підключення недоступне.
          </Alert>
        </Card>
      </div>
    );
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
    const patient = apptQ.data?.patient;
    const isAnon = apptQ.data?.isAnonymousPatient;
    const patientName = isAnon
      ? 'Анонімний пацієнт'
      : patient
        ? `${patient.firstName} ${patient.lastName}`.trim() || 'Пацієнт'
        : 'Пацієнт';
    const patientPresent = sessionQ.data?.patientPresent ?? false;
    // Numeric DD.MM.YYYY + HH:mm – HH:mm. Mirror of the patient lobby
    // formatting; no dayjs locale loaded so we avoid month names.
    const start = apptQ.data ? dayjs(apptQ.data.startAt) : null;
    const end = apptQ.data ? dayjs(apptQ.data.endAt) : null;

    return (
      <div className="space-y-6">
        <PageHeader
          title="Підготовка до консультації"
          description="Перевірте мікрофон і камеру перед стартом"
        />
        <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
          <Card>
            <div className="space-y-4">
              {/* Anonymous appointments carry no PII (no Patient row, no
               * name) — there's nothing meaningful to show, and rendering
               * "Анонімний пацієнт" as a label adds noise without
               * informing. Skip the block entirely; the time-of-consultation
               * + presence indicator below still tell the doctor what they
               * need before joining. */}
              {!isAnon ? (
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Пацієнт
                  </span>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">
                    {patientName}
                  </h3>
                  {patient?.phone ? (
                    <p className="text-sm text-slate-600">{patient.phone}</p>
                  ) : null}
                </div>
              ) : null}
              {start && end ? (
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Час консультації
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-slate-800">
                    <span className="font-medium">{start.format('DD.MM.YYYY')}</span>
                    <span className="text-slate-400">·</span>
                    <span>
                      {start.format('HH:mm')}
                      <span className="mx-1 text-slate-400">–</span>
                      {end.format('HH:mm')}
                    </span>
                  </div>
                </div>
              ) : null}
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    patientPresent ? 'bg-emerald-500' : 'bg-amber-400'
                  } ${patientPresent ? '' : 'animate-pulse'}`}
                  aria-hidden
                />
                <span className="text-sm text-slate-700">
                  {patientPresent
                    ? 'Пацієнт онлайн'
                    : 'Пацієнт ще не приєднався'}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                Праворуч можна перевірити, як виглядає ваше відео, та обрати
                потрібну камеру/мікрофон. Натисніть «Розпочати консультацію»,
                коли будете готові.
              </p>
              {error ? <Alert variant="danger">{error}</Alert> : null}
              <Button
                onClick={() => tokenM.mutate()}
                isLoading={tokenM.isPending}
                fullWidth
                size="lg"
              >
                Розпочати консультацію
              </Button>
            </div>
          </Card>
          <Card>
            <LobbyPreview state={deviceState} onChange={updateDeviceState} />
          </Card>
        </div>
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
          video={
            deviceState.cameraEnabled
              ? deviceState.videoDeviceId
                ? { deviceId: { exact: deviceState.videoDeviceId } }
                : true
              : false
          }
          audio={
            deviceState.micEnabled
              ? deviceState.audioDeviceId
                ? { deviceId: { exact: deviceState.audioDeviceId } }
                : true
              : false
          }
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
                new VideoPreset(1280, 720, 1_500_000, 30),
              ],
            },
          }}
          onConnected={() => setDisconnectReason(null)}
          onError={(e) => setDisconnectReason(e.message)}
          onDisconnected={(reason) => {
            // Don't auto-redirect — show the user what happened so they can
            // retry. Auto-navigating to /finish on a connection failure made
            // the page look like it skipped the call entirely.
            //
            // CLIENT_INITIATED fires for intentional disconnects (Leave
            // button, page navigation, React StrictMode double-mount in
            // dev). Skip the alert in that case — the connection didn't
            // actually fail, so showing "Connection lost" misleads the user.
            if (reason !== DisconnectReason.CLIENT_INITIATED) {
              setDisconnectReason(reason ? `disconnected: ${reason}` : 'disconnected');
            }
            setJoined(false);
            // Refetch the appointment so the terminal-state branch can take
            // over when the *other* side ended the call (the backend deletes
            // the LK room and flips the appointment to COMPLETED).
            void apptQ.refetch();
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
