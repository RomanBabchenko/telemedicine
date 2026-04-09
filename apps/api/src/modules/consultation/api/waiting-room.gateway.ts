import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface ChatMessage {
  sessionId: string;
  authorIdentity: string;
  text: string;
  ts: number;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/waiting-room',
})
export class WaitingRoomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(WaitingRoomGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.debug(`waiting-room connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`waiting-room disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sessionId: string; identity: string },
  ): void {
    client.join(`session:${body.sessionId}`);
    this.server.to(`session:${body.sessionId}`).emit('presence', {
      identity: body.identity,
      status: 'joined',
    });
  }

  @SubscribeMessage('chat')
  onChat(@MessageBody() body: ChatMessage): void {
    this.server.to(`session:${body.sessionId}`).emit('chat', body);
  }
}
