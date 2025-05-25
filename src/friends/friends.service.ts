import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Friend, FriendStatus } from './schemas/friend.schema';
import { User } from '../auth/schemas/user.schema';
import { FriendRequestDto } from './dto/friend-request.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Message } from '../messages/schemas/message.schema';
import { Conversation } from '../conversation/schemas/conversation.schema';

@Injectable()
export class FriendsService {
  constructor(
    @InjectModel(Friend.name) private friendModel: Model<Friend>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<Conversation>,
    private eventEmitter: EventEmitter2,
  ) {}

  async sendFriendRequest(data: FriendRequestDto): Promise<Friend> {
    const receiver = await this.userModel.findById(data.receiverId);
    if (!receiver) {
      throw new NotFoundException(`User with ID ${data.receiverId} not found`);
    }

    if (data.userId === data.receiverId) {
      throw new BadRequestException(`You cannot add yourself as a friend`);
    }

    const existingFriendship = await this.getExistingFriendship(
      data.userId,
      data.receiverId,
    );

    if (existingFriendship) {
      await this.handleExistingFriendship(existingFriendship, data.userId);
    }

    const friendRequest = await this.friendModel.create({
      userId: data.userId,
      friendId: data.receiverId,
      status: FriendStatus.PENDING,
    });

    this.eventEmitter.emit('friend.request.created', {
      type: 'FRIEND_REQUEST',
      receiverId: data.receiverId,
      senderId: data.userId,
    });

    return friendRequest;
  }

  private async handleExistingFriendship(
    friendship: Friend,
    requesterId: string,
  ): Promise<void> {
    if (friendship.status === FriendStatus.ACCEPTED) {
      throw new ConflictException('You are already friends with this user');
    } else if (friendship.status === FriendStatus.PENDING) {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      if (friendship.userId.toString() === requesterId) {
        throw new ConflictException('Friend request already sent');
      } else {
        throw new ConflictException(
          'This user has already sent you a friend request',
        );
      }
    }

    await this.friendModel.deleteOne({ _id: friendship._id });
  }

  private async getExistingFriendship(
    userId: string,
    friendId: string,
  ): Promise<Friend | null> {
    return this.friendModel.findOne({
      $or: [
        { userId: userId, friendId: friendId },
        { userId: friendId, friendId: userId },
      ],
    });
  }
  async acceptFriendRequest(data: FriendRequestDto): Promise<Friend> {
    const friendRequest = await this.friendModel.findOne({
      userId: data.receiverId,
      friendId: data.userId,
      status: FriendStatus.PENDING,
    });

    if (!friendRequest) {
      throw new NotFoundException('Friend request not found');
    }

    friendRequest.status = FriendStatus.ACCEPTED;
    await friendRequest.save();
    this.eventEmitter.emit('friendship.updated', {
      user1: data.userId,
      user2: data.receiverId,
    });

    return friendRequest;
  }

  async rejectFriendRequest(data: FriendRequestDto): Promise<Friend> {
    const friendRequest = await this.friendModel.findOne({
      userId: data.receiverId,
      friendId: data.userId,
      status: FriendStatus.PENDING,
    });

    if (!friendRequest) {
      throw new NotFoundException('Friend request not found');
    }

    await this.friendModel.deleteOne({ _id: friendRequest._id });

    this.eventEmitter.emit('friendship.updated', {
      user1: data.userId,
      user2: data.receiverId,
    });

    return friendRequest;
  }

  async areFriends(userId: string, friendId: string): Promise<boolean> {
    const friendship = await this.friendModel.findOne({
      $or: [
        { userId, friendId, status: FriendStatus.ACCEPTED },
        { userId: friendId, friendId: userId, status: FriendStatus.ACCEPTED },
      ],
    });

    return !!friendship;
  }

  async getFriendIds(userId: string): Promise<string[]> {
    const friends = await this.friendModel
      .find({
        $or: [
          { userId, status: FriendStatus.ACCEPTED },
          { friendId: userId, status: FriendStatus.ACCEPTED },
        ],
      })
      .select('userId friendId -_id')
      .lean();

    return friends.map((friendship) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const userIdStr = friendship.userId.toString();

      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      return userIdStr === userId ? friendship.friendId.toString() : userIdStr;
    });
  }

  async searchUsers(currentUserId: string, query: string) {
    if (!query || query.length < 2) {
      return [];
    }

    const searchRegex = new RegExp(query, 'i');

    const users = await this.userModel
      .find(
        {
          $and: [
            { _id: { $ne: currentUserId } },
            {
              $or: [
                { username: searchRegex },
                { email: searchRegex },
                { firstName: searchRegex },
                { lastName: searchRegex },
              ],
            },
          ],
        },
        {
          _id: 1,
          username: 1,
          email: 1,
          firstName: 1,
          lastName: 1,
          avatar: 1,
        },
      )
      .lean();

    const foundUserIds = users.map((user) => user._id);
    const existingFriendships = await this.friendModel
      .find({
        $or: [
          { userId: currentUserId, friendId: { $in: foundUserIds } },
          { friendId: currentUserId, userId: { $in: foundUserIds } },
        ],
      })
      .lean();
    return users.map((user) => {
      const friendship = existingFriendships.find(
        (f) =>
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          (f.userId.toString() === currentUserId &&
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            f.friendId.toString() === user._id.toString()) ||
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          (f.friendId.toString() === currentUserId &&
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            f.userId.toString() === user._id.toString()),
      );

      return {
        ...user,
        friendshipStatus: friendship ? friendship.status : null,
      };
    });
  }

  async getPendingFriendRequests(userId: string): Promise<Friend[]> {
    const pendingRequests = await this.friendModel
      .find({
        friendId: userId,
        status: FriendStatus.PENDING,
      })
      .populate('userId', 'username email firstName lastName avatar')
      .lean();

    return pendingRequests;
  }

  async getFriendsWithDetails(userId: string) {
    const friendIds = await this.getFriendIds(userId);
    const friendUsers = await this.userModel
      .find(
        { _id: { $in: friendIds } },
        {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          username: 1,
          avatar: 1,
          isOnline: 1,
        },
      )
      .lean();

    const friendsWithUnreadCounts = await Promise.all(
      friendUsers.map(async (friend) => {
        const unreadCount = await this.getUnreadMessageCount(
          userId,
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          friend._id.toString(),
        );
        return {
          ...friend,
          unreadCount,
        };
      }),
    );

    return friendsWithUnreadCounts;
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
      console.error('Error getting unread message count:', error);
      return 0;
    }
  }
}
