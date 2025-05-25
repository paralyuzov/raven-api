import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageType } from '../messages/schemas/message.schema';
import { Conversation } from '../conversation/schemas/conversation.schema';
import { FriendsService } from 'src/friends/friends.service';

@Injectable()
export class ChatService {
  private connectedUsers = new Map<string, string>(); // userId -> socketId
  private logger = new Logger('ChatService');

  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<Conversation>,
    private readonly friendService: FriendsService,
  ) {}

  registerUser(userId: string, socketId: string): void {
    this.connectedUsers.set(userId, socketId);
    this.logger.log(`User registered: ${userId} (${socketId})`);
  }

  removeUser(userId: string): void {
    if (this.connectedUsers.has(userId)) {
      const socketId = this.connectedUsers.get(userId);
      this.connectedUsers.delete(userId);
      this.logger.log(`User unregistered: ${userId} (${socketId})`);
    }
  }

  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  getUserSocketId(userId: string): string | undefined {
    return this.connectedUsers.get(userId);
  }

  // Join a conversation: check if user is a participant
  async joinConversation(
    conversationId: string,
    userId: string,
  ): Promise<Conversation> {
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) throw new NotFoundException('Conversation not found');
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    if (!conversation.participants.some((id) => id.toString() === userId)) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }
    return conversation;
  }

  // Send a message in a conversation
  async sendMessage(
    senderId: string,
    conversationId: string,
    content: string,
    type: MessageType = MessageType.TEXT,
  ): Promise<Message> {
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) throw new NotFoundException('Conversation not found');
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    if (!conversation.participants.some((id) => id.toString() === senderId)) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }
    const message = await this.messageModel.create({
      conversationId,
      senderId,
      content,
      type,
    });
    return message;
  }

  async sendMediaMessage(
    senderId: string,
    conversationId: string,
    fileUrl: string,
    type: MessageType,
    originalFileName: string,
    fileSize: number,
    mimeType: string,
  ): Promise<Message> {
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) throw new NotFoundException('Conversation not found');
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    if (!conversation.participants.some((id) => id.toString() === senderId)) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }
    const message = await this.messageModel.create({
      conversationId,
      senderId,
      content: fileUrl,
      type,
      originalFileName,
      fileSize,
      mimeType,
    });
    return message;
  }

  async getOnlineFriendIds(userId: string): Promise<string[]> {
    try {
      const friendIds = await this.friendService.getFriendIds(userId);

      return friendIds.filter((friendId) => this.isUserOnline(friendId));
    } catch (error) {
      this.logger.error(`Error getting online friends: ${error}`);
      return [];
    }
  }

  async getFriendIds(userId: string): Promise<string[]> {
    try {
      return await this.friendService.getFriendIds(userId);
    } catch (error) {
      this.logger.error(`Error getting friend IDs: ${error}`);
      return [];
    }
  }

  getConnectedUsers(): Map<string, string> {
    return this.connectedUsers;
  }

  async getConversationById(
    conversationId: string,
  ): Promise<Conversation | null> {
    try {
      return await this.conversationModel.findById(conversationId);
    } catch (error) {
      this.logger.error(`Error getting conversation: ${error}`);
      return null;
    }
  }

  async getUnreadMessageCount(
    userId: string,
    friendId: string,
  ): Promise<number> {
    try {
      const conversation = await this.conversationModel.findOne({
        participants: { $all: [userId, friendId] },
      });

      if (!conversation) {
        return 0;
      }

      const unreadCount = await this.messageModel.countDocuments({
        conversationId: conversation._id,
        senderId: friendId,
        read: false,
      });

      return unreadCount;
    } catch (error) {
      this.logger.error(`Error getting unread message count: ${error}`);
      return 0;
    }
  }

  async markMessagesAsRead(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    try {
      await this.messageModel.updateMany(
        {
          conversationId,
          senderId: { $ne: userId },
          read: false,
        },
        { read: true },
      );

      this.logger.log(
        `Marked messages as read for user ${userId} in conversation ${conversationId}`,
      );
    } catch (error) {
      this.logger.error(`Error marking messages as read: ${error}`);
    }
  }
}
