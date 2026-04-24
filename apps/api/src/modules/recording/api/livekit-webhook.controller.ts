import {
  BadRequestException,
  Controller,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { Public } from '../../../common/auth/decorators';
import { AppConfig } from '../../../config/env.config';
import { RecordingService } from '../application/recording.service';

// LiveKit signs its webhook body as JWT in the Authorization header using the
// same api_key/api_secret pair configured for the server. WebhookReceiver
// validates the signature against the raw request bytes — any re-serialisation
// of req.body breaks the hash, which is why main.ts opts into rawBody: true
// and we read req.rawBody below instead of parsing from the framework-decoded
// body.

@ApiExcludeController()
@Controller('webhooks/livekit')
export class LiveKitWebhookController {
  private readonly logger = new Logger(LiveKitWebhookController.name);
  private readonly receiver: WebhookReceiver;

  constructor(
    private readonly recording: RecordingService,
    config: AppConfig,
  ) {
    this.receiver = new WebhookReceiver(
      config.livekit.apiKey,
      config.livekit.apiSecret,
    );
  }

  @Post()
  @Public()
  async receive(@Req() req: Request): Promise<{ received: boolean }> {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      // If this fires, the NestFactory config regressed (rawBody: true lost).
      throw new BadRequestException('Raw request body not available');
    }
    const auth = req.header('authorization') ?? '';

    // receive() throws on invalid/missing signature; surface as 401 so
    // LiveKit retries with backoff rather than spamming.
    let event: Awaited<ReturnType<WebhookReceiver['receive']>>;
    try {
      event = await this.receiver.receive(rawBody.toString('utf-8'), auth);
    } catch (e) {
      this.logger.warn(
        `Rejected LiveKit webhook: ${(e as Error).message}`,
      );
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.log(
      `LiveKit webhook: event=${event.event} egressId=${event.egressInfo?.egressId ?? '-'} room=${event.room?.name ?? '-'}`,
    );

    // Only events we care about for now. Extend this switch as more signals
    // become useful (e.g. room_finished → auto-end consultation).
    if (event.event === 'egress_ended' && event.egressInfo) {
      await this.recording.handleEgressEnded(
        event.egressInfo.egressId,
        computeEgressDurationSec(event.egressInfo),
      );
    }

    return { received: true };
  }
}

// EgressInfo carries startedAt / endedAt as BigInt nanoseconds since epoch
// (or 0n / undefined when not populated). Convert to a plain seconds number;
// return null when either bound is missing so the caller preserves the
// existing DB value rather than overwriting with garbage.
function computeEgressDurationSec(info: {
  startedAt?: bigint | number | string;
  endedAt?: bigint | number | string;
}): number | null {
  const start = toBigInt(info.startedAt);
  const end = toBigInt(info.endedAt);
  if (start === null || end === null || end <= start) return null;
  // (end - start) is nanoseconds; convert to seconds via Number after the
  // subtraction so we don't blow precision on the raw epoch values.
  return Number(end - start) / 1e9;
}

function toBigInt(v: bigint | number | string | undefined): bigint | null {
  if (v === undefined || v === null) return null;
  try {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number') return BigInt(v);
    if (typeof v === 'string' && v.length > 0) return BigInt(v);
  } catch {
    // malformed — treat as missing
  }
  return null;
}
