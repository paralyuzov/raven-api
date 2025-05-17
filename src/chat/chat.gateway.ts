import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  WsException,
} from '@nestjs/websockets';
import { ChatService } from './chat.service';
import { Server, Socket } from 'socket.io';

import { Logger, UseGuards, ForbiddenException } from '@nestjs/common';
import { WsAuthGuard } from '../guards/ws-auth.guard';
import { OnEvent } from '@nestjs/event-emitter';
interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
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
      if (error instanceof WsException) {
        this.disconnect(client, error.message);
      } else {
        this.logger.error('Unexpected connection error', error);
        this.disconnect(client, 'Server error during authentication');
      }
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    try {
      const userId = await this.wsAuthGuard.validateToken(client);

      if (userId) {
        this.chatService.removeUser(userId);
        this.logger.log(`Client disconnected: ${userId} (${client.id})`);
        await this.notifyFriendsOfStatus(userId, false);
      }
    } catch (error) {
      this.logger.error('Error handling disconnect', error);
    }
  }

  private disconnect(client: Socket, reason: string): void {
    this.logger.log(`Disconnecting client ${client.id}: ${reason}`);
    client.emit('error', { message: reason });
    client.disconnect(true);
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    client: AuthenticatedSocket,
    payload: { receiverId: string; content: string; type?: string },
  ): Promise<void> {
    try {
      const senderId = client.data.userId;

      if (!senderId) {
        client.emit('error', { message: 'Unauthorized' });
        return;
      }

      const { receiverId, content, type = 'text' } = payload;

      if (!receiverId || !content) {
        client.emit('error', { message: 'Invalid message format' });
        return;
      }

      try {
        const message = await this.chatService.sendMessage(
          senderId,
          receiverId,
          content,
          type,
        );

        const messageData = {
          id: message._id,
          senderId,
          receiverId,
          content,
          type,
          timestamp: new Date(),
        };

        this.server.to(`user:${receiverId}`).emit('new_message', messageData);

        client.emit('message_sent', {
          id: message._id,
          receiverId,
          delivered: this.chatService.isUserOnline(receiverId),
          timestamp: new Date(),
        });
      } catch (serviceError) {
        if (serviceError instanceof ForbiddenException) {
          client.emit('error', {
            code: 'NOT_FRIENDS',
            message: serviceError.message,
          });
        } else {
          throw serviceError;
        }
      }
    } catch (error) {
      this.logger.error('Error sending message', error);
      client.emit('error', { message: 'Failed to send message' });
    }
  }

  private async notifyFriendsOfStatus(
    userId: string,
    isOnline: boolean,
  ): Promise<void> {
    try {
      const onlineFriendIds = await this.chatService.getOnlineFriendIds(userId);
      const statusUpdate = {
        userId: userId,
        status: isOnline ? 'online' : 'offline',
        timestamp: new Date(),
      };

      onlineFriendIds.forEach((friendId) => {
        this.server.to(`user:${friendId}`).emit('friend_status', statusUpdate);
      });
    } catch (error) {
      this.logger.error(`Error notifying friends of status change: ${error}`);
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
}
