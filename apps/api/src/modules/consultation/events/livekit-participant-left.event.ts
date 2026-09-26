// Published by the LiveKit webhook (recording module) on `participant_left`.
// Consumed here in the consultation module, which owns session_events — the
// recording module can't depend on ConsultationService (it's the other way
// round), so the event bus decouples the two.
export class LiveKitParticipantLeftEvent {
  constructor(
    public readonly roomName: string,
    public readonly identity: string,
    public readonly leftAt: Date,
  ) {}
}
