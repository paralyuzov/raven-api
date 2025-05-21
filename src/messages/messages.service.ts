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

    const message = await this.messageModel.create({
      senderId,
      receiverId,
      content,
      type,
    });

    return message;
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

  async markMessagesAsRead(userId: string, senderId: string) {
    return this.messageModel.updateMany(
      { receiverId: userId, senderId: senderId },
      { $set: { read: true } },
    );
  }

  async getUnreadMessageCounts(userId: string) {
    const unreadMessages = await this.messageModel.aggregate([
      {
        $match: {
          receiverId: userId,
          read: false,
        },
      },
      {
        $group: {
          _id: '$senderId',
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {};
    unreadMessages.forEach((item) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      result[item._id] = item.count;
    });

    return result;
  }
}
