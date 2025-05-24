import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
} from '@nestjs/websockets';
import { ChatService } from './chat.service';
import { Server, Socket } from 'socket.io';
import {
  Logger,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WsAuthGuard } from '../guards/ws-auth.guard';
import { OnEvent } from '@nestjs/event-emitter';
import { MessageType } from '../messages/schemas/message.schema';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
  };
}

@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
@UseGuards(WsAuthGuard)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  private logger = new Logger('ChatGateway');

  constructor(
    private readonly chatService: ChatService,
    private readonly wsAuthGuard: WsAuthGuard,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const userId = await this.wsAuthGuard.validateToken(client);
      client.data = { userId };
      this.chatService.registerUser(userId, client.id);
      await client.join(`user:${userId}`);
      this.logger.log(`Client connected: ${userId} (${client.id})`);
    } catch (error) {
      this.logger.error('Connection error', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const userId = client.data?.userId;
      if (userId) {
        this.chatService.removeUser(userId);
        this.logger.log(`Client disconnected: ${userId} (${client.id})`);
      }
    } catch (error) {
      this.logger.error('Error handling disconnect', error);
    }
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    client: AuthenticatedSocket,
    payload: { conversationId: string },
  ): Promise<void> {
    const userId = client.data.userId;
    const { conversationId } = payload;
    try {
      await this.chatService.joinConversation(conversationId, userId);
      await client.join(`conversation:${conversationId}`);
      client.emit('joined_conversation', { conversationId });
      this.logger.log(`User ${userId} joined conversation ${conversationId}`);
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    client: AuthenticatedSocket,
    payload: { conversationId: string; content: string; type?: string },
  ): Promise<void> {
    const senderId = client.data.userId;
    const { conversationId, content, type } = payload;
    if (!conversationId || !content) {
      client.emit('error', { message: 'Invalid message format' });
      return;
    }
    try {
      const messageType: MessageType = Object.values(MessageType).includes(
        type as MessageType,
      )
        ? (type as MessageType)
        : MessageType.TEXT;

      const message = await this.chatService.sendMessage(
        senderId,
        conversationId,
        content,
        messageType,
      );
      const messageData = {
        id: message._id,
        conversationId,
        senderId,
        content,
        type: message.type,
        timestamp: message.createdAt
          ? new Date(message.createdAt).toISOString()
          : undefined,
      };
      this.server
        .to(`conversation:${conversationId}`)
        .emit('new_message', messageData);
      client.emit('message_sent', {
        id: message._id,
        conversationId,
        timestamp: message.createdAt
          ? new Date(message.createdAt).toISOString()
          : undefined,
      });
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        client.emit('error', { message: error.message });
      } else {
        this.logger.error('Error sending message', error);
        client.emit('error', { message: 'Failed to send message' });
      }
    }
  }

  @OnEvent('friend.request.created')
  handleFriendRequestCreated(payload: {
    type: string;
    receiverId: string;
    senderId: string;
  }): void {
    const { receiverId, senderId } = payload;

    this.logger.log(
      `Friend request created: notifying user ${receiverId} to refresh requests`,
    );

    this.server.to(`user:${receiverId}`).emit('refresh_friend_requests', {
      action: 'FRIEND_REQUEST_RECEIVED',
      senderId,
    });
  }

  @OnEvent('friendship.updated')
  handleFriendshipUpdated(payload: { user1: string; user2: string }): void {
    const { user1, user2 } = payload;

    this.logger.log(`Friendship established between ${user1} and ${user2}`);

    this.server
      .to(`user:${user1}`)
      .emit('friendship_updated', { friendId: user2 });
    this.server
      .to(`user:${user2}`)
      .emit('friendship_updated', { friendId: user1 });
  }

  initializeSocketEvents(socket: Socket): void {
    socket.on('connect', () => console.log('Socket connected'));
    socket.on('disconnect', () => console.log('Socket disconnected'));
    socket.on('connect_error', (err) =>
      console.error('Socket connect error:', err),
    );
  }
}
