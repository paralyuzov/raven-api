import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

interface JwtPayload {
  userId: string;
}

@Injectable()
export class WsAuthGuard {
  private readonly logger = new Logger(WsAuthGuard.name);
  constructor(private readonly jwtService: JwtService) {}
  async validateToken(client: Socket): Promise<string> {
    const token: string | undefined =
      (client.handshake.auth.token as string) ||
      client.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      this.logger.warn('No token provided');
      throw new WsException('No authentication token provided');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      return payload.userId;
    } catch (error) {
      this.logger.error(`Token validation error: ${error}`);
      throw new WsException(`Authentication failed: ${error}`);
    }
  }
}
