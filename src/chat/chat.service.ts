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

  async getOnlineFriendIds(userId: string): Promise<string[]> {
    try {
      const friendIds = await this.friendService.getFriendIds(userId);

      return friendIds.filter((friendId) => this.isUserOnline(friendId));
    } catch (error) {
      this.logger.error(`Error getting online friends: ${error}`);
      return [];
    }
  }
}
