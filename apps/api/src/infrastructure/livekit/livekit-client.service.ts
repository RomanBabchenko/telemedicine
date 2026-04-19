import { Injectable, Logger } from '@nestjs/common';
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
  S3Upload,
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

  async startAudioEgress(roomName: string, objectKey: string): Promise<{ egressId: string }> {
    const egressS3Endpoint = `http://${this.config.minio.egressEndpoint}:${this.config.minio.port}`;
    this.logger.log(`Egress S3 endpoint: ${egressS3Endpoint} (egressEndpoint=${this.config.minio.egressEndpoint})`);
    const s3 = new S3Upload({
      accessKey: this.config.minio.accessKey,
      secret: this.config.minio.secretKey,
      region: this.config.minio.region,
      endpoint: egressS3Endpoint,
      bucket: this.config.minio.bucket,
      forcePathStyle: true,
    });
    const out = new EncodedFileOutput({
      // MP3 — universally playable and compact; MIS systems (DocDream etc.)
      // consume the audio from the download URL, they prefer MP3 over OGG.
      fileType: EncodedFileType.MP3,
      filepath: objectKey,
      output: { case: 's3', value: s3 },
    });
    try {
      const info = await this.egressClient.startRoomCompositeEgress(roomName, out, {
        audioOnly: true,
      });
      return { egressId: info.egressId };
    } catch (e) {
      const err = e as Error;
      this.logger.warn(
        `Egress start failed for room ${roomName} (using stub): ${err.message}`,
        err.cause ? `cause: ${JSON.stringify(err.cause)}` : '',
      );
      return { egressId: `stub-egress-${Date.now()}` };
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
}
