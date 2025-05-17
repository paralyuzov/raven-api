import { Injectable, ForbiddenException } from '@nestjs/common';
import { Message } from './schemas/message.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FriendsService } from '../friends/friends.service';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    private readonly friendsService: FriendsService,
  ) {}

  async createMessage(
    senderId: string,
    receiverId: string,
    content: string,
    type: string = 'text',
  ): Promise<Message> {
    const areFriends = await this.friendsService.areFriends(
      senderId,
      receiverId,
    );

    if (!areFriends) {
      throw new ForbiddenException('You can only send messages to friends');
    }

    return this.messageModel.create({
      senderId,
      receiverId,
      content,
      type,
    });
  }

  async getMessages(userId: string, friendId: string): Promise<Message[]> {
    const areFriends = await this.friendsService.areFriends(userId, friendId);

    if (!areFriends) {
      throw new ForbiddenException('You can only view messages with friends');
    }

    return this.messageModel
      .find({
        $or: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      })
      .sort({ createdAt: 1 });
  }
}
