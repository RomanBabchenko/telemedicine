import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePreviewTracks } from '@livekit/components-react';
import { LocalVideoTrack, Track } from 'livekit-client';
import { Button, Select } from '@telemed/ui';

export interface LobbyDeviceState {
  cameraEnabled: boolean;
  micEnabled: boolean;
  videoDeviceId: string | undefined;
  audioDeviceId: string | undefined;
}

interface LobbyPreviewProps {
  state: LobbyDeviceState;
  onChange: (next: Partial<LobbyDeviceState>) => void;
}

// Pre-join self-view: a local camera/mic preview with device pickers and
// on/off toggles. The user's choices propagate up via onChange so the parent
// can mount LiveKitRoom with the same audio/video options when the user
// finally hits "Connect".
//
// Implementation note: usePreviewTracks owns the LocalVideoTrack /
// LocalAudioTrack lifecycle — it stops the underlying MediaStreamTrack on
// cleanup. Toggling camera/mic off re-runs the hook with `false`, which
// releases the device. Don't call track.stop() manually here.
export const LobbyPreview = ({ state, onChange }: LobbyPreviewProps) => {
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Memoise the options object — without this, every render produces a new
  // reference and the hook tears down/re-creates tracks (camera flicker).
  const previewOptions = useMemo(
    () => ({
      video: state.cameraEnabled
        ? state.videoDeviceId
          ? { deviceId: { exact: state.videoDeviceId } }
          : true
        : false,
      audio: state.micEnabled
        ? state.audioDeviceId
          ? { deviceId: { exact: state.audioDeviceId } }
          : true
        : false,
    }),
    [state.cameraEnabled, state.micEnabled, state.videoDeviceId, state.audioDeviceId],
  );

  // usePreviewTracks compares its onError arg by *reference* in the effect
  // deps — passing an inline arrow on each render would tear down + re-init
  // tracks every render (visible as a black preview + camera LED flicker).
  const onPreviewError = useCallback((e: Error) => setError(e.message), []);
  const tracks = usePreviewTracks(previewOptions, onPreviewError);

  const videoTrack = useMemo(
    () =>
      tracks?.find((t): t is LocalVideoTrack => t.kind === Track.Kind.Video),
    [tracks],
  );

  const videoElRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = videoElRef.current;
    if (!videoTrack || !el) return;
    videoTrack.attach(el);
    return () => {
      videoTrack.detach(el);
    };
  }, [videoTrack]);

  // Device labels are blank until getUserMedia has succeeded, so we
  // re-enumerate after the preview tracks are alive (proxy for "permission
  // granted"). devicechange fires when the user plugs a USB headset etc.
  useEffect(() => {
    if (!tracks?.length) return;
    let cancelled = false;
    const reload = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setVideoDevices(all.filter((d) => d.kind === 'videoinput'));
        setAudioDevices(all.filter((d) => d.kind === 'audioinput'));
      } catch {
        // noop — devices stay empty, dropdown becomes a no-op
      }
    };
    void reload();
    navigator.mediaDevices?.addEventListener('devicechange', reload);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener('devicechange', reload);
    };
  }, [tracks]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-900">
        {state.cameraEnabled ? (
          <video
            ref={videoElRef}
            className="h-full w-full object-cover"
            autoPlay
            muted
            playsInline
            // Disable the floating PiP button Chrome injects on any
            // playing <video>. We have no use for PiP on the lobby preview.
            disablePictureInPicture
            // Mirror the local preview so it feels like a mirror, matching
            // every consumer video-call app the user has ever seen.
            style={{ transform: 'scaleX(-1)' }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-300">
            Камеру вимкнено
          </div>
        )}
        {!state.micEnabled ? (
          <span className="absolute right-2 top-2 rounded bg-red-600/90 px-2 py-0.5 text-xs font-medium text-white">
            Мікрофон вимкнено
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="text-xs text-red-600">
          Не вдалося отримати доступ до камери/мікрофона: {error}. Перевірте
          дозволи у браузері.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={state.cameraEnabled ? 'outline' : 'primary'}
          size="sm"
          onClick={() => onChange({ cameraEnabled: !state.cameraEnabled })}
        >
          {state.cameraEnabled ? 'Вимкнути камеру' : 'Увімкнути камеру'}
        </Button>
        <Button
          variant={state.micEnabled ? 'outline' : 'primary'}
          size="sm"
          onClick={() => onChange({ micEnabled: !state.micEnabled })}
        >
          {state.micEnabled ? 'Вимкнути мікрофон' : 'Увімкнути мікрофон'}
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Камера</span>
          <Select
            disabled={!state.cameraEnabled || videoDevices.length === 0}
            value={state.videoDeviceId ?? videoDevices[0]?.deviceId ?? ''}
            onChange={(e) => onChange({ videoDeviceId: e.target.value })}
          >
            {videoDevices.length === 0 ? (
              <option value="">— пристрої недоступні —</option>
            ) : (
              videoDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Камера ${d.deviceId.slice(0, 6)}`}
                </option>
              ))
            )}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Мікрофон</span>
          <Select
            disabled={!state.micEnabled || audioDevices.length === 0}
            value={state.audioDeviceId ?? audioDevices[0]?.deviceId ?? ''}
            onChange={(e) => onChange({ audioDeviceId: e.target.value })}
          >
            {audioDevices.length === 0 ? (
              <option value="">— пристрої недоступні —</option>
            ) : (
              audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Мікрофон ${d.deviceId.slice(0, 6)}`}
                </option>
              ))
            )}
          </Select>
        </label>
      </div>
    </div>
  );
};
