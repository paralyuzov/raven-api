import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
} from '@nestjs/websockets';
import { ChatService } from './chat.service';
import { Server, Socket } from 'socket.io';
import { Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WsAuthGuard } from '../guards/ws-auth.guard';
import { OnEvent } from '@nestjs/event-emitter';
import { MessageType } from '../messages/schemas/message.schema';
import { InjectModel } from '@nestjs/mongoose';
import { User } from '../auth/schemas/user.schema';
import { Model } from 'mongoose';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
  };
}

@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  private logger = new Logger('ChatGateway');

  constructor(
    private readonly chatService: ChatService,
    private readonly wsAuthGuard: WsAuthGuard,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  private isClientAuthenticated(client: AuthenticatedSocket): boolean {
    return !!(client.data && client.data.userId);
  }

  private sendAuthenticationError(client: Socket): void {
    client.emit('auth_error', {
      type: 'not_authenticated',
      message: 'You must be authenticated to perform this action.',
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const userId = await this.wsAuthGuard.validateToken(client);
      client.data = { userId };
      this.chatService.registerUser(userId, client.id);
      await client.join(`user:${userId}`);
      await this.notifyFriendsStatusChange(userId, true);
      this.logger.log(`Client connected: ${userId} (${client.id})`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Connection error', errorMessage);

      if (errorMessage.includes('Token expired')) {
        client.emit('auth_error', {
          type: 'token_expired',
          message: 'Your session has expired. Please refresh the page.',
        });
      } else if (errorMessage.includes('Invalid token')) {
        client.emit('auth_error', {
          type: 'invalid_token',
          message: 'Authentication failed. Please login again.',
        });
      } else {
        client.emit('auth_error', {
          type: 'auth_failed',
          message: 'Connection failed. Please try again.',
        });
      }

      setTimeout(() => client.disconnect(), 100);
    }
  }

  handleDisconnect(client: Socket): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const userId: string = client.data?.userId;
      if (userId) {
        this.chatService.removeUser(userId);

        this.notifyFriendsStatusChange(userId, false).catch((error) => {
          this.logger.error(
            'Error notifying friends of offline status',
            String(error),
          );
        });

        this.logger.log(`Client disconnected: ${userId} (${client.id})`);
      }
    } catch (error) {
      this.logger.error('Error handling disconnect', String(error));
    }
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    client: AuthenticatedSocket,
    payload: { conversationId: string },
  ): Promise<void> {
    if (!this.isClientAuthenticated(client)) {
      this.sendAuthenticationError(client);
      return;
    }

    const userId = client.data.userId;
    const { conversationId } = payload;
    try {
      await this.chatService.joinConversation(conversationId, userId);
      await client.join(`conversation:${conversationId}`);

      await this.chatService.markMessagesAsRead(conversationId, userId);

      await this.notifyUnreadCountAfterRead(conversationId, userId);

      client.emit('joined_conversation', { conversationId });
      this.logger.log(`User ${userId} joined conversation ${conversationId}`);
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('leave_conversation')
  async handleLeaveConversation(
    client: AuthenticatedSocket,
    payload: { conversationId: string },
  ): Promise<void> {
    if (!this.isClientAuthenticated(client)) {
      this.sendAuthenticationError(client);
      return;
    }

    const userId = client.data.userId;
    const { conversationId } = payload;
    try {
      await client.leave(`conversation:${conversationId}`);
      client.emit('left_conversation', { conversationId });
      this.logger.log(`User ${userId} left conversation ${conversationId}`);
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
    if (!this.isClientAuthenticated(client)) {
      this.sendAuthenticationError(client);
      return;
    }

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
      await this.notifyUnreadCountUpdate(conversationId, senderId);
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

  @SubscribeMessage('send_media_message')
  async handleSendMediaMessage(
    client: AuthenticatedSocket,
    payload: {
      conversationId: string;
      fileUrl: string;
      type: 'image' | 'video';
      originalFileName: string;
      fileSize: number;
      mimeType: string;
    },
  ): Promise<void> {
    if (!this.isClientAuthenticated(client)) {
      this.sendAuthenticationError(client);
      return;
    }

    const senderId = client.data.userId;
    const {
      conversationId,
      fileUrl,
      type,
      originalFileName,
      fileSize,
      mimeType,
    } = payload;

    try {
      const messageType =
        type === 'image' ? MessageType.IMAGE : MessageType.VIDEO;

      const message = await this.chatService.sendMediaMessage(
        senderId,
        conversationId,
        fileUrl,
        messageType,
        originalFileName,
        fileSize,
        mimeType,
      );

      const messageData = {
        id: message._id,
        conversationId,
        senderId,
        content: fileUrl,
        type: messageType,
        originalFileName,
        fileSize,
        mimeType,
        timestamp: message.createdAt?.toISOString(),
      };

      this.server
        .to(`conversation:${conversationId}`)
        .emit('new_message', messageData);

      client.emit('message_sent', {
        id: message._id,
        conversationId,
        timestamp: message.createdAt?.toISOString(),
      });

      await this.notifyUnreadCountUpdate(conversationId, senderId);
    } catch (error) {
      this.logger.error('Error sending media message', error);
      client.emit('error', { message: 'Failed to send media message' });
    }
  }

  @SubscribeMessage('get_friend_status')
  async handleGetFriendStatus(
    client: AuthenticatedSocket,
    payload: { friendId: string },
  ): Promise<void> {
    if (!this.isClientAuthenticated(client)) {
      this.sendAuthenticationError(client);
      return;
    }

    const userId = client.data.userId;
    const { friendId } = payload;

    try {
      const friendIds = await this.chatService.getFriendIds(userId);
      if (!friendIds.includes(friendId)) {
        client.emit('error', { message: 'User is not your friend' });
        return;
      }

      const isOnline = this.chatService.isUserOnline(friendId);
      client.emit('friend_status_response', {
        friendId,
        isOnline,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Error getting friend status', String(error));
      client.emit('error', { message: 'Failed to get friend status' });
    }
  }

  @OnEvent('friend.request.created')
  async handleFriendRequestCreated(payload: {
    type: string;
    receiverId: string;
    senderId: string;
  }): Promise<void> {
    const { receiverId, senderId } = payload;

    try {
      const sender = await this.userModel.findById(senderId, {
        _id: 1,
        nickname: 1,
        firstName: 1,
        lastName: 1,
      });

      if (!sender) {
        this.logger.error(`Sender with ID ${senderId} not found`);
        return;
      }

      const isReceiverOnline = this.chatService.isUserOnline(receiverId);
      if (isReceiverOnline) {
        this.logger.log(
          ` Receiver ${receiverId} is online, sending socket event`,
        );
      } else {
        this.logger.log(
          ` Receiver ${receiverId} is offline, event will be missed`,
        );
      }

      this.server.to(`user:${receiverId}`).emit('refresh_friend_requests', {
        message: `${sender.nickname || sender.firstName} sent you a friend request`,
        sender: {
          id: senderId,
          username: sender.nickname || sender.firstName,
        },
      });
    } catch (error) {
      this.logger.error('Error handling friend request created:', error);
    }
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

  async notifyFriendsStatusChange(
    userId: string,
    isOnline: boolean,
  ): Promise<void> {
    try {
      const friendIds = await this.chatService.getFriendIds(userId);
      const notificationPromises = friendIds.map((friendId) => {
        if (this.chatService.isUserOnline(friendId)) {
          this.server.to(`user:${friendId}`).emit('friend_status_change', {
            userId,
            isOnline,
            timestamp: new Date().toISOString(),
          });
        }
      });

      await Promise.all(notificationPromises);

      this.logger.log(
        `Notified ${friendIds.length} friends that user ${userId} is ${isOnline ? 'online' : 'offline'}`,
      );
    } catch (error) {
      this.logger.error(
        `Error notifying friends of status change for user ${userId}`,
        String(error),
      );
    }
  }

  async notifyUnreadCountUpdate(
    conversationId: string,
    senderId: string,
  ): Promise<void> {
    try {
      const conversation =
        await this.chatService.getConversationById(conversationId);
      if (!conversation) {
        return;
      }

      const participantStrings = conversation.participants.map((p) => {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        return p.toString();
      });
      const recipientId = participantStrings.find(
        (participantId) => participantId !== senderId,
      );

      if (!recipientId) {
        return;
      }

      const recipientSocketId = this.chatService.getUserSocketId(recipientId);
      let isRecipientViewingConversation = false;

      if (recipientSocketId) {
        try {
          const conversationRoomName = `conversation:${conversationId}`;
          const socketsInRoom = await this.server
            .in(conversationRoomName)
            .fetchSockets();
          isRecipientViewingConversation = socketsInRoom.some(
            (socket) => socket.id === recipientSocketId,
          );
        } catch (error) {
          this.logger.warn(
            `Error checking room membership for user ${recipientId}: ${String(error)}`,
          );
          isRecipientViewingConversation = false;
        }
      }

      if (isRecipientViewingConversation) {
        await this.chatService.markMessagesAsRead(conversationId, recipientId);

        this.logger.log(
          `Recipient ${recipientId} is viewing conversation ${conversationId}, marked messages as read`,
        );
      }

      const unreadCount = await this.chatService.getUnreadMessageCount(
        recipientId,
        senderId,
      );

      this.server.to(`user:${recipientId}`).emit('unread_count_update', {
        friendId: senderId,
        unreadCount,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `Notified user ${recipientId} about unread count update from ${senderId}: ${unreadCount}`,
      );
    } catch (error) {
      this.logger.error(
        `Error notifying unread count update: ${String(error)}`,
      );
    }
  }

  async notifyUnreadCountAfterRead(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    try {
      const conversation =
        await this.chatService.getConversationById(conversationId);
      if (!conversation) {
        return;
      }

      const participantStrings = conversation.participants.map((p) => {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        return p.toString();
      });
      const otherParticipantId = participantStrings.find(
        (participantId) => participantId !== userId,
      );

      if (!otherParticipantId) {
        return;
      }

      const unreadCount = await this.chatService.getUnreadMessageCount(
        userId,
        otherParticipantId,
      );

      this.server.to(`user:${userId}`).emit('unread_count_update', {
        friendId: otherParticipantId,
        unreadCount,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `Notified user ${userId} about unread count update from ${otherParticipantId}: ${unreadCount}`,
      );
    } catch (error) {
      this.logger.error(
        `Error notifying unread count after read: ${String(error)}`,
      );
    }
  }

  initializeSocketEvents(socket: Socket): void {
    socket.on('connect', () => console.log('Socket connected'));
    socket.on('disconnect', () => console.log('Socket disconnected'));
    socket.on('connect_error', (err) =>
      console.error('Socket connect error:', err),
    );
  }
}
