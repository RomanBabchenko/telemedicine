import { useMemo, useState } from 'react';
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
import { Track, VideoPreset } from 'livekit-client';
import { bookingApi, consultationApi } from '@telemed/api-client';
import { Alert, Button, Card, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const booking = bookingApi(apiClient);
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

  const apptQ = useQuery({
    queryKey: ['appointment', id],
    queryFn: () => booking.getById(id!),
    enabled: !!id,
  });

  const tokenM = useMutation({
    mutationFn: async () => {
      const a = apptQ.data;
      if (!a?.consultationSessionId) throw new Error('Сесію ще не створено');
      return consultation.joinToken(a.consultationSessionId);
    },
    onSuccess: () => setJoined(true),
    onError: (e: Error) => setError(e.message),
  });

  const livekitUrl = useMemo(
    () => (tokenM.data ? resolveLiveKitUrl(tokenM.data.livekitUrl) : ''),
    [tokenM.data],
  );

  if (apptQ.isLoading) return <Spinner />;

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
        onError={(e) => setDisconnectReason(e.message)}
        onDisconnected={(reason) => {
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
