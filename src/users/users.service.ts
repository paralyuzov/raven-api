import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../auth/schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async getUserById(userId: string) {
    const user = await this.userModel
      .findById(userId, {
        _id: 1,
        firstName: 1,
        lastName: 1,
        nickname: 1,
        email: 1,
        avatar: 1,
        isOnline: 1,
      })
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
