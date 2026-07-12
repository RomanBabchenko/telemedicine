import { useEffect, useState } from 'react';
import { MediaDeviceMenu, TrackToggle } from '@livekit/components-react';
import { Track } from 'livekit-client';

// Mirrors ControlBar's responsive behavior: icon-only below ~760px.
const useIsNarrow = (): boolean => {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
};

// Ukrainian replacement for LiveKit's default <ControlBar/> buttons — the
// library hardcodes English labels ("Microphone", "Camera", "Share screen")
// with no locale support. Composed from the same primitives, so styling and
// behavior (device menus, toggle state) stay identical. Render inside an
// `.lk-control-bar` wrapper; the leave/fullscreen buttons remain per-app.
export const CallControls = () => {
  const narrow = useIsNarrow();
  const showText = !narrow;
  const canShareScreen =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

  return (
    <>
      <div className="lk-button-group">
        <TrackToggle source={Track.Source.Microphone} showIcon>
          {showText ? 'Мікрофон' : null}
        </TrackToggle>
        <div className="lk-button-group-menu">
          <MediaDeviceMenu kind="audioinput" />
        </div>
      </div>
      <div className="lk-button-group">
        <TrackToggle source={Track.Source.Camera} showIcon>
          {showText ? 'Камера' : null}
        </TrackToggle>
        <div className="lk-button-group-menu">
          <MediaDeviceMenu kind="videoinput" />
        </div>
      </div>
      {canShareScreen ? (
        <TrackToggle
          source={Track.Source.ScreenShare}
          captureOptions={{ audio: true, selfBrowserSurface: 'include' }}
          showIcon
        >
          {showText ? 'Демонстрація екрана' : null}
        </TrackToggle>
      ) : null}
    </>
  );
};
