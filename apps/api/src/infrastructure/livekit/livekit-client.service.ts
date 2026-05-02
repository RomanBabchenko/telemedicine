import { Injectable, Logger } from '@nestjs/common';
import {
  AccessToken,
  DirectFileOutput,
  EgressClient,
  RoomServiceClient,
  S3Upload,
  TrackType,
  VideoGrant,
} from 'livekit-server-sdk';
import { AppConfig } from '../../config/env.config';

interface IssueTokenInput {
  roomName: string;
  identity: string;
  name?: string;
  isDoctor: boolean;
  ttlSeconds?: number;
  canPublish?: boolean;
}

@Injectable()
export class LiveKitClientService {
  private readonly logger = new Logger(LiveKitClientService.name);
  private roomService: RoomServiceClient;
  private egressClient: EgressClient;

  constructor(private readonly config: AppConfig) {
    this.roomService = new RoomServiceClient(
      this.toHttpUrl(config.livekit.url),
      config.livekit.apiKey,
      config.livekit.apiSecret,
    );
    this.egressClient = new EgressClient(
      this.toHttpUrl(config.livekit.url),
      config.livekit.apiKey,
      config.livekit.apiSecret,
    );
  }

  private toHttpUrl(wsUrl: string): string {
    return wsUrl.replace(/^ws/, 'http').replace('//localhost:', '//127.0.0.1:');
  }

  get publicUrl(): string {
    return this.config.livekit.url;
  }

  async createRoomIfNotExists(roomName: string): Promise<void> {
    try {
      const rooms = await this.roomService.listRooms([roomName]);
      if (rooms.length > 0) return;
      await this.roomService.createRoom({ name: roomName, emptyTimeout: 600, maxParticipants: 8 });
    } catch {
      // Room may exist or LiveKit may be unreachable in dev — caller will retry on join.
    }
  }

  async issueToken(input: IssueTokenInput): Promise<{ token: string; expiresAt: Date }> {
    const ttlSeconds = input.ttlSeconds ?? 3600;
    const at = new AccessToken(this.config.livekit.apiKey, this.config.livekit.apiSecret, {
      identity: input.identity,
      name: input.name,
      ttl: ttlSeconds,
    });
    const grant: VideoGrant = {
      room: input.roomName,
      roomJoin: true,
      canPublish: input.canPublish ?? true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: input.isDoctor,
    };
    at.addGrant(grant);
    const token = await at.toJwt();
    return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  /**
   * Start a passthrough TrackEgress for a single audio track. Output is OGG
   * (Opus container around the published RTP), no transcoding — the egress
   * container does ~0% CPU work, which is what makes 30+ concurrent sessions
   * feasible on a small VM. Mixing into a single MP3 happens later in the
   * RecordingMergeProcessor.
   *
   * On failure (e.g. egress unreachable in dev) returns a stub egressId so the
   * caller can persist a row and continue; webhook reconciliation will skip
   * stub ids.
   */
  async startAudioTrackEgress(
    roomName: string,
    trackId: string,
    objectKey: string,
  ): Promise<{ egressId: string }> {
    const egressS3Endpoint = `http://${this.config.minio.egressEndpoint}:${this.config.minio.port}`;
    const s3 = new S3Upload({
      accessKey: this.config.minio.accessKey,
      secret: this.config.minio.secretKey,
      region: this.config.minio.region,
      endpoint: egressS3Endpoint,
      bucket: this.config.minio.bucket,
      forcePathStyle: true,
    });
    const out = new DirectFileOutput({
      filepath: objectKey,
      output: { case: 's3', value: s3 },
    });
    try {
      const info = await this.egressClient.startTrackEgress(roomName, out, trackId);
      return { egressId: info.egressId };
    } catch (e) {
      const err = e as Error;
      this.logger.warn(
        `startTrackEgress failed (room=${roomName}, track=${trackId}): ${err.message}`,
        err.cause ? `cause: ${JSON.stringify(err.cause)}` : '',
      );
      return { egressId: `stub-egress-${Date.now()}-${trackId}` };
    }
  }

  /**
   * Catch-up enumeration of currently-published audio tracks in a room.
   * Used when recording starts AFTER participants have already published —
   * the track_published webhook only fires for new publications, so we need
   * this to pick up the steady-state set.
   */
  async listAudioTracks(roomName: string): Promise<Array<{ identity: string; trackSid: string }>> {
    try {
      const participants = await this.roomService.listParticipants(roomName);
      const out: Array<{ identity: string; trackSid: string }> = [];
      for (const p of participants) {
        for (const t of p.tracks ?? []) {
          if (t.type === TrackType.AUDIO && !t.muted) {
            out.push({ identity: p.identity, trackSid: t.sid });
          }
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  async stopEgress(egressId: string): Promise<void> {
    if (egressId.startsWith('stub-egress-')) return;
    try {
      await this.egressClient.stopEgress(egressId);
    } catch {
      // ignore in dev
    }
  }

  async deleteRoom(roomName: string): Promise<void> {
    try {
      await this.roomService.deleteRoom(roomName);
    } catch {
      // ignore
    }
  }

  /**
   * Best-effort list of identities currently connected to a room. Returns []
   * if the room doesn't exist or LiveKit is unreachable — callers (the lobby
   * presence indicator) treat that as "no one connected" rather than a hard
   * error, since the data only drives a UI hint.
   */
  async listParticipantIdentities(roomName: string): Promise<string[]> {
    try {
      const participants = await this.roomService.listParticipants(roomName);
      return participants.map((p) => p.identity);
    } catch {
      return [];
    }
  }
}
