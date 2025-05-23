import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthGuard } from '../guards/auth.guard';
import { GetUser } from '../decorators/get-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() signupData: SignupDto) {
    return this.authService.signup(signupData);
  }

  @Post('login')
  async login(@Body() loginData: LoginDto) {
    return this.authService.login(loginData);
  }

  @Post('refresh-token')
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  async logout(@GetUser('_id') userId: string) {
    return this.authService.logout(userId);
  }

  @Get('verify')
  @UseGuards(AuthGuard)
  async verifyToken(@GetUser('_id') userId: string) {
    const user = await this.authService.getUserById(userId);
    return {
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        nickname: user.nickname,
        email: user.email,
        avatar: user.avatar || '',
      },
    };
  }
}
