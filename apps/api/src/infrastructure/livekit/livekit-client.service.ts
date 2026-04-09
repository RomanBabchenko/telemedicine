import { Injectable } from '@nestjs/common';
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
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
    return wsUrl.replace(/^ws/, 'http');
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
    const out = new EncodedFileOutput({
      fileType: EncodedFileType.OGG,
      filepath: objectKey,
    });
    try {
      const info = await this.egressClient.startRoomCompositeEgress(roomName, out, {
        audioOnly: true,
      });
      return { egressId: info.egressId };
    } catch {
      // Egress not available in dev — return a stub id so the flow continues.
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
