import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { ConsultationService } from '../application/consultation.service';
import { LiveKitParticipantLeftEvent } from './livekit-participant-left.event';

// Logs a LEAVE session event for every participant leaving the LiveKit room.
// Gives the stale-consultation sweeper a real "last activity" when the clinic
// doesn't record audio (no egress end times), so auto-ended sessions don't
// get endedAt = the second JOIN and a ~0 s duration.
@Injectable()
@EventsHandler(LiveKitParticipantLeftEvent)
export class RecordLeaveOnParticipantLeftHandler implements IEventHandler<LiveKitParticipantLeftEvent> {
  private readonly logger = new Logger(RecordLeaveOnParticipantLeftHandler.name);

  constructor(private readonly consultations: ConsultationService) {}

  async handle(event: LiveKitParticipantLeftEvent): Promise<void> {
    try {
      await this.consultations.recordParticipantLeft(event.roomName, event.identity, event.leftAt);
    } catch (e) {
      this.logger.warn(
        `Failed to record LEAVE for ${event.identity} in ${event.roomName}: ${(e as Error).message}`,
      );
    }
  }
}
