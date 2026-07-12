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
  useRoomContext,
  useTracks,
} from '@livekit/components-react';
import { DisconnectReason, Track, VideoPreset } from 'livekit-client';
import dayjs from 'dayjs';
import { bookingApi, consultationApi } from '@telemed/api-client';
import { AppointmentStatus } from '@telemed/shared-types';
import { Alert, Button, Card, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { LobbyDeviceState, LobbyPreview } from './LobbyPreview';

// Replaces LiveKit's built-in DisconnectButton (hidden via controls={{leave:false}})
// so the label is Ukrainian like the rest of the UI — the library's default
// "Leave" is hardcoded English, not tied to any locale. A patient leaving is
// just a disconnect; ending the session for everyone is the doctor's action.
const LeaveButton = () => {
  const room = useRoomContext();
  return (
    <button
      type="button"
      onClick={() => void room.disconnect()}
      className="lk-button lk-disconnect-button"
      aria-label="Вийти"
    >
      Вийти
    </button>
  );
};

const booking = bookingApi(apiClient);
const consultation = consultationApi(apiClient);

// Must mirror the backend gate in ConsultationService.issueJoinToken —
// UI phases flip on the same boundaries so users don't hit a 403 surprise.
const JOIN_OPENS_BEFORE_START_MIN = 15;
const JOIN_CLOSES_AFTER_END_MIN = 30;

// Mirrors TERMINAL_APPOINTMENT_STATUSES in ConsultationService — once the
// appointment is in any of these, the join-token endpoint will 403 with
// `consultation.terminal`. We detect it client-side too so the patient sees
// "meeting cancelled/finished" instead of the generic waiting room.
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

// Cross-browser fullscreen helpers. Safari < 16.4 still ships only the
// `webkit*` variants, and iPhone Safari refuses real fullscreen on anything
// other than a <video> — for that case the caller falls back to a CSS
// "pseudo-fullscreen" (position: fixed, inset: 0).
type FsDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
const isRealFullscreenSupported = (): boolean => {
  if (typeof document === 'undefined') return false;
  const d = document as FsDocument;
  return Boolean(d.fullscreenEnabled ?? d.webkitFullscreenEnabled);
};
const getFullscreenElement = (): Element | null => {
  const d = document as FsDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
};
const requestFullscreenCompat = (el: HTMLElement): Promise<void> | void => {
  const e = el as FsElement;
  const fn = e.requestFullscreen ?? e.webkitRequestFullscreen;
  return fn?.call(el);
};
const exitFullscreenCompat = (): Promise<void> | void => {
  const d = document as FsDocument;
  const fn = d.exitFullscreen ?? d.webkitExitFullscreen;
  return fn?.call(document);
};

const FullscreenIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {expanded ? (
      <path d="M8 3v4a2 2 0 0 1-2 2H2M16 3v4a2 2 0 0 0 2 2h4M8 21v-4a2 2 0 0 0-2-2H2M16 21v-4a2 2 0 0 1 2-2h4" />
    ) : (
      <path d="M3 9V5a2 2 0 0 1 2-2h4M21 9V5a2 2 0 0 0-2-2h-4M3 15v4a2 2 0 0 0 2 2h4M21 15v4a2 2 0 0 1-2 2h-4" />
    )}
  </svg>
);

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
  // Use dvh (dynamic viewport height) so the conference fills the visible
  // area even on mobile Safari/Chrome where the URL bar appears and disappears
  // — plain vh treats the URL bar as part of the viewport and pushes the
  // layout off-screen. Fallback to vh for ancient browsers that don't know
  // dvh (Safari < 15.4) — still wrong but won't break.
  const height = isFullscreen
    ? 'calc(100dvh - 80px)'
    : 'calc(100dvh - 320px)';
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

  // Device choices made in the pre-join lobby — passed to LiveKitRoom on
  // connect so the call starts with the camera/mic the user previewed.
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
  // We listen for both the unprefixed and the webkit-prefixed event so older
  // Safari (< 16.4) keeps the icon in sync. On iPhone Safari neither event
  // fires (we use pseudo-fullscreen there), so the state is driven directly
  // from the toggle handler.
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!getFullscreenElement());
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
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
    const el = fsContainerRef.current;
    if (!el) return;
    // Already in real fullscreen → exit via API. Already in pseudo (no real
    // FS element but state says we are) → flip state off.
    if (getFullscreenElement()) {
      void exitFullscreenCompat();
      return;
    }
    if (isFullscreen) {
      setIsFullscreen(false);
      return;
    }
    // Try real fullscreen first, even on phones — Android Chrome supports it
    // and produces a much cleaner result than CSS pseudo. Fall back to pseudo
    // only if the request is rejected (e.g. iPhone Safari, where it always
    // is for non-<video> elements).
    if (isRealFullscreenSupported()) {
      const result = requestFullscreenCompat(el);
      if (result instanceof Promise) {
        result.catch(() => setIsFullscreen(true));
      }
      return;
    }
    setIsFullscreen(true);
  };

  // Pseudo-fullscreen body-scroll lock. Only applies when there's no real FS
  // element (browser handles scroll itself for real FS). Without this, on
  // iPhone Safari the page underneath stays scrollable behind the overlay
  // and the user-visible viewport can drift, exposing the page header.
  useEffect(() => {
    if (!isFullscreen || getFullscreenElement()) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);

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

  // Poll the session while the patient is in the lobby — the doctorPresent
  // flag is server-derived from LiveKit room presence and drives the
  // "Лікар онлайн / ще не приєднався" indicator. Stops polling once we
  // join (we'll see the doctor directly via LiveKit then).
  const sessionId = apptQ.data?.consultationSessionId ?? null;
  const sessionQ = useQuery({
    queryKey: ['session-presence', sessionId],
    queryFn: () => consultation.getById(sessionId!),
    enabled: !!sessionId && !joined,
    refetchInterval: !joined ? 5_000 : false,
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
    onError: (e: Error) =>
      setError(extractApiMessage(e, 'Не вдалося підключитись до зустрічі')),
  });

  const livekitUrl = useMemo(
    () => (tokenM.data ? resolveLiveKitUrl(tokenM.data.livekitUrl) : ''),
    [tokenM.data],
  );

  if (apptQ.isLoading || phase === 'loading') return <Spinner />;

  // Terminal-state short-circuit — if the appointment was already cancelled
  // or completed (e.g. patient reopens the invite link after the doctor
  // ended the call, or the clinic cancelled in MIS), tell them up front
  // instead of showing the "press Connect" instructions and letting them
  // hit a 403. Mirrors the backend's `consultation.terminal` gate.
  const apptStatus = apptQ.data?.status;
  if (apptStatus && CANCELLED_STATUSES.has(apptStatus)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Зустріч скасовано" />
        <Card>
          <Alert variant="info">
            Цю зустріч скасовано — підключення недоступне. Якщо це сталося
            помилково, зверніться до клініки.
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
            Цю зустріч уже завершено — підключення недоступне. Якщо у вас
            залишились питання, зверніться до клініки.
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
    const doctor = apptQ.data?.doctor;
    const doctorName = doctor
      ? `${doctor.firstName} ${doctor.lastName}`.trim()
      : 'Ваш лікар';
    const doctorSpec =
      doctor && doctor.specializations.length > 0
        ? doctor.specializations.join(', ')
        : null;
    const doctorPresent = sessionQ.data?.doctorPresent ?? false;
    // Numeric DD.MM.YYYY + HH:mm – HH:mm. dayjs has no locale loaded in
    // this app, so we avoid month-name formats to keep things readable
    // for Ukrainian users without pulling a locale bundle.
    const start = apptQ.data ? dayjs(apptQ.data.startAt) : null;
    const end = apptQ.data ? dayjs(apptQ.data.endAt) : null;

    return (
      <div className="space-y-6">
        <PageHeader
          title="Зала очікування"
          description="Підготуйте мікрофон та камеру"
        />
        <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
          <Card>
            <div className="space-y-4">
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Ваш лікар
                </span>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  {doctorName}
                </h3>
                {doctorSpec ? (
                  <p className="text-sm text-slate-600">{doctorSpec}</p>
                ) : null}
              </div>
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
                    doctorPresent ? 'bg-emerald-500' : 'bg-amber-400'
                  } ${doctorPresent ? '' : 'animate-pulse'}`}
                  aria-hidden
                />
                <span className="text-sm text-slate-700">
                  {doctorPresent
                    ? 'Лікар онлайн — можна підключатись'
                    : 'Очікуємо лікаря…'}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                Натисніть «Підключитись», коли будете готові. Перед цим можете
                перевірити, як виглядає ваше відео й налаштувати потрібну камеру
                та мікрофон праворуч.
              </p>
              {error ? <Alert variant="danger">{error}</Alert> : null}
              <Button
                onClick={() => tokenM.mutate()}
                isLoading={tokenM.isPending}
                fullWidth
                size="lg"
              >
                Підключитись
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
      <PageHeader title="Консультація" />
      {disconnectReason ? (
        <Alert variant="danger" title="З'єднання розірвано">
          {disconnectReason}. Перевірте мережу та натисніть «Підключитись» знову.
        </Alert>
      ) : null}
      <div
        ref={fsContainerRef}
        className="overflow-hidden rounded-lg bg-black"
        style={
          // Pseudo-fullscreen styles — applied only when we are flagged as
          // fullscreen but the real FS API is not in use (iPhone Safari, or
          // a real-FS request that was rejected). Use explicit edge offsets
          // and 100dvh so iOS' shrinking visual viewport (URL bar) doesn't
          // push the bottom of the overlay below the visible area, leaving
          // the page header peeking through at the top.
          isFullscreen && !getFullscreenElement()
            ? {
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                height: '100dvh',
                zIndex: 9999,
                borderRadius: 0,
              }
            : undefined
        }
      >
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
          // Low-bandwidth defaults — see ConsultationPage.tsx in web-doctor.
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
            // CLIENT_INITIATED fires for intentional disconnects (Leave
            // button, page navigation, React StrictMode double-mount in
            // dev). Skip the alert in that case — the connection didn't
            // actually fail, so showing "Connection lost" misleads the user.
            if (reason !== DisconnectReason.CLIENT_INITIATED) {
              setDisconnectReason(reason ? `disconnected: ${reason}` : 'disconnected');
            }
            setJoined(false);
            // Refetch the appointment so the terminal-state branch can take
            // over: when the doctor ends the call, the backend deletes the
            // LK room (triggering this disconnect) and marks the appointment
            // COMPLETED. Without a refetch we'd render the "Підключитись"
            // lobby again and the user would only learn the call ended on
            // the next 403.
            void apptQ.refetch();
          }}
        >
          <LayoutContextProvider>
            <ConferenceLayout isFullscreen={isFullscreen} />
            <RoomAudioRenderer />
            {/* Fullscreen toggle sits inside the same .lk-control-bar row as
             * mic/camera/share — top-right used to collide with each tile's
             * FocusToggle icon, and a separate absolute button overlapped
             * the share-screen control on narrow viewports. The inner
             * ControlBar uses `display: contents` so its buttons become flex
             * siblings of our icon button under the outer wrapper. */}
            <div
              className="lk-control-bar"
              style={{ flexWrap: 'wrap', maxHeight: 'none' }}
            >
              <ControlBar style={{ display: 'contents' }} controls={{ leave: false }} />
              <LeaveButton />
              <button
                type="button"
                onClick={toggleFullscreen}
                className="lk-button"
                aria-label={isFullscreen ? 'Звичайний режим' : 'На весь екран'}
                title={isFullscreen ? 'Звичайний режим' : 'На весь екран'}
              >
                <FullscreenIcon expanded={isFullscreen} />
              </button>
            </div>
          </LayoutContextProvider>
        </LiveKitRoom>
      </div>
    </div>
  );
};
