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

    const existingFriendship = await this.friendModel.findOne({
      $or: [
        { userId: data.userId, friendId: data.receiverId },
        { userId: data.receiverId, friendId: data.userId },
      ],
    });

    if (existingFriendship) {
      if (existingFriendship.status === FriendStatus.ACCEPTED) {
        throw new ConflictException('You are already friends with this user');
      } else if (existingFriendship.status === FriendStatus.PENDING) {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        if (existingFriendship.userId.toString() === data.userId) {
          throw new ConflictException('Friend request already sent');
        } else {
          throw new ConflictException(
            'This user has already sent you a friend request',
          );
        }
      }
      // If friendship was rejected or blocked, allow new request
      await this.friendModel.deleteOne({ _id: existingFriendship._id });
    }

    // Create new friendship
    return this.friendModel.create({
      userId: data.userId,
      friendId: data.receiverId,
      status: FriendStatus.PENDING,
    });
  }
}
