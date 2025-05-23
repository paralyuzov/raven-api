import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './schemas/user.schema';
import { Model } from 'mongoose';
import { SignupDto } from './dto/signup.dto';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { RefreshToken } from './schemas/refresh-token.schema';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshToken>,
    private jwtService: JwtService,
  ) {}

  async signup(signupData: SignupDto) {
    const { firstName, lastName, nickname, email, password } = signupData;

    const emailExists = await this.userModel.findOne({ email });
    if (emailExists) {
      throw new BadRequestException('Email already exists');
    }

    const nicknameExists = await this.userModel.findOne({ nickname });
    if (nicknameExists) {
      throw new BadRequestException('Nickname already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await this.userModel.create({
      firstName,
      lastName,
      nickname,
      email,
      password: hashedPassword,
    });

    return {
      message: 'User created successfully',
      data: {
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        nickname: newUser.nickname,
        email: newUser.email,
      },
    };
  }

  async login(credentials: LoginDto) {
    const { identifier, password } = credentials;

    const user = await this.userModel.findOne({
      $or: [{ email: identifier }, { nickname: identifier }],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.userModel.findByIdAndUpdate(user._id, { isOnline: true });

    const tokens = await this.generateToken(String(user._id));
    return {
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        nickname: user.nickname,
        email: user.email,
        avatar: user.avatar || '',
      },
      ...tokens,
    };
  }

  async refreshToken(token: string) {
    const refreshToken = await this.refreshTokenModel.findOne({
      token,
      expiresAt: { $gte: new Date() },
    });
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.generateToken(String(refreshToken.userId));
  }

  async generateToken(userId: string) {
    const accessToken = this.jwtService.sign({ userId });
    const refreshToken = uuidv4();
    await this.storeRefreshToken(refreshToken, userId);
    return {
      accessToken,
      refreshToken,
    };
  }

  async storeRefreshToken(refreshToken: string, userId: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3);
    await this.refreshTokenModel.updateOne(
      { userId },
      { $set: { token: refreshToken, expiresAt } },
      { upsert: true },
    );
  }

  async logout(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, { isOnline: false });
    await this.refreshTokenModel.deleteOne({ userId });
    return { message: 'Logged out successfully' };
  }

  async getUserById(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }
}
