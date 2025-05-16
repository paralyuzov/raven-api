import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message } from '../messages/schemas/message.schema';
import { FriendsService } from 'src/friends/friends.service';

@Injectable()
export class ChatService {
  private connectedUsers = new Map<string, string>(); // userId -> socketId
  private logger = new Logger('ChatService');

  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
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

  async sendMessage(
    senderId: string,
    receiverId: string,
    content: string,
    type: string = 'text',
  ): Promise<Message> {
    const areFriends = await this.friendService.areFriends(
      senderId,
      receiverId,
    );
    if (!areFriends) {
      throw new ForbiddenException('You can only send messages to friends');
    }
    const message = await this.messageModel.create({
      senderId,
      receiverId,
      content,
      type,
    });

    return message;
  }

  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
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
