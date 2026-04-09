import { useMemo, useState } from 'react';
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
import { consultationApi } from '@telemed/api-client';
import { Alert, Button, Card, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const consultation = consultationApi(apiClient);

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

  const sessionQ = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => consultation.getById(sessionId!),
    enabled: !!sessionId,
  });

  const tokenM = useMutation({
    mutationFn: () => consultation.joinToken(sessionId!),
    onSuccess: () => setJoined(true),
    onError: (e: Error) => setError(e.message),
  });

  const livekitUrl = useMemo(
    () => (tokenM.data ? resolveLiveKitUrl(tokenM.data.livekitUrl) : ''),
    [tokenM.data],
  );

  if (sessionQ.isLoading) return <Spinner />;

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
          <Link to={`/consultation/${sessionId}/finish`}>
            <Button variant="outline">Завершити та оформити</Button>
          </Link>
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
