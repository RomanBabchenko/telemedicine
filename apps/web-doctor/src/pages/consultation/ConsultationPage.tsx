import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { Alert, Button, Card, Modal, PageHeader, Spinner } from '@telemed/ui';
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
  // layout off-screen.
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

// Replaces LiveKit's built-in DisconnectButton (hidden via controls={{leave:false}}).
// The red button used to silently drop the doctor back to the lobby with the
// session, recording and appointment all still active — now it opens a modal
// with an explicit choice: end the consultation for everyone, step away
// (plain disconnect, rejoinable), or stay.
const LeaveButton = ({
  onEnd,
  endPending,
  finishFlowPath,
}: {
  onEnd: () => void;
  endPending: boolean;
  // Set for regular appointments — the "end & document" flow. Null for
  // invite-scoped/anonymous consultations where the MIS owns documentation.
  finishFlowPath: string | null;
}) => {
  const room = useRoomContext();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lk-button lk-disconnect-button"
        aria-label="Вийти"
      >
        Вийти
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Вийти з консультації?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Залишитись
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                void room.disconnect();
              }}
            >
              Відлучитися
            </Button>
            {finishFlowPath ? (
              <Button
                variant="danger"
                onClick={() => {
                  setOpen(false);
                  navigate(finishFlowPath);
                }}
              >
                Завершити та оформити
              </Button>
            ) : (
              <Button
                variant="danger"
                isLoading={endPending}
                onClick={() => {
                  setOpen(false);
                  onEnd();
                }}
              >
                Завершити консультацію
              </Button>
            )}
          </>
        }
      >
        <p className="text-sm text-slate-600">
          <strong>«Завершити»</strong> — закінчує прийом для всіх учасників, зупиняє запис і
          закриває кімнату.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          <strong>«Відлучитися»</strong> — ви тимчасово виходите; прийом і запис тривають,
          пацієнт залишається в кімнаті, ви зможете повернутися.
        </p>
      </Modal>
    </>
  );
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
      {/* Ending the consultation lives in the leave modal (red Вийти button
        * in the control bar) — no duplicate action in the header. */}
      <PageHeader title="Консультація" />
      {disconnectReason ? (
        <Alert variant="danger" title="З'єднання розірвано">
          {disconnectReason}. Перевірте мережу та натисніть «Розпочати консультацію» знову.
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
              {/* leave:false hides LiveKit's raw DisconnectButton — our
               * LeaveButton opens the end/step-away modal instead. */}
              <ControlBar style={{ display: 'contents' }} controls={{ leave: false }} />
              <LeaveButton
                onEnd={() => endM.mutate()}
                endPending={endM.isPending}
                finishFlowPath={
                  isInviteScope || apptQ.data?.isAnonymousPatient
                    ? null
                    : `/consultation/${sessionId}/finish`
                }
              />
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
