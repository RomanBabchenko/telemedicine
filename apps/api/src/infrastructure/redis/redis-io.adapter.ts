import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import IORedis from 'ioredis';
import type { ServerOptions } from 'socket.io';

// Socket.io adapter backed by Redis pub/sub. Without it, waiting-room rooms
// are in-process only: two participants of the same session landing on
// different API instances would never see each other's chat/presence
// (ALB stickiness pins a client, not a session).
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplication,
    private readonly host: string,
    private readonly port: number,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const pubClient = new IORedis({ host: this.host, port: this.port, maxRetriesPerRequest: null });
    const subClient = pubClient.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): ReturnType<IoAdapter['createIOServer']> {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
