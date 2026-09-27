import { ReactNode, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ConsultationSessionDto, RecordingNoticeDecision } from '@telemed/shared-types';
import { RecordingNoticeModal } from './RecordingNoticeModal';

// Join-token 403 code when the caller hasn't accepted the recording notice.
export const RECORDING_NOTICE_REQUIRED_CODE = 'consultation.recording_notice_required';

const errorMessage = (e: unknown): string => {
  const body = (e as { response?: { data?: { message?: unknown } } })?.response?.data;
  if (body && typeof body.message === 'string' && body.message) return body.message;
  return 'Не вдалося зберегти відповідь. Спробуйте ще раз.';
};

interface Options {
  session: ConsultationSessionDto | undefined;
  side: 'doctor' | 'patient';
  respond: (decision: RecordingNoticeDecision) => Promise<ConsultationSessionDto>;
  // Receives the updated session; the caller continues with its join.
  onAccepted: (session: ConsultationSessionDto) => void;
  // The appointment is cancelled and the room closed — refetch to show it.
  onDeclined: () => void;
}

/**
 * Gate in front of "join the call". `requestJoin(join)` runs `join` straight
 * away when there's nothing to accept (notice off / not recording / already
 * accepted on this session), otherwise opens the notice; accepting then
 * calls `onAccepted`, declining cancels the consultation.
 */
export const useRecordingNotice = ({ session, side, respond, onAccepted, onDeclined }: Options) => {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptM = useMutation({
    mutationFn: () => respond('accepted'),
    onSuccess: (updated) => {
      setOpen(false);
      onAccepted(updated);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const declineM = useMutation({
    mutationFn: () => respond('declined'),
    onSuccess: () => {
      setOpen(false);
      onDeclined();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const acceptedAt =
    side === 'doctor' ? session?.doctorRecordingNoticeAt : session?.patientRecordingNoticeAt;
  const required = !!session?.recordingNotice && !acceptedAt;

  const show = () => {
    setError(null);
    setOpen(true);
  };

  const requestJoin = (join: () => void) => {
    if (required) show();
    else join();
  };

  const modal: ReactNode =
    open && session?.recordingNotice ? (
      <RecordingNoticeModal
        notice={session.recordingNotice}
        onAccept={() => acceptM.mutate()}
        onDecline={() => declineM.mutate()}
        accepting={acceptM.isPending}
        declining={declineM.isPending}
        error={error}
      />
    ) : null;

  return { requestJoin, show, modal };
};
