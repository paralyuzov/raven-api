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

@Injectable()
export class FriendsService {
  constructor(
    @InjectModel(Friend.name) private friendModel: Model<Friend>,
    @InjectModel(User.name) private userModel: Model<User>,
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

    return this.friendModel.create({
      userId: data.userId,
      friendId: data.receiverId,
      status: FriendStatus.PENDING,
    });
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
}
