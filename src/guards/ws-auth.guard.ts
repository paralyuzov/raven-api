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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : 'Unknown';

      if (errorName === 'TokenExpiredError') {
        this.logger.warn(`Token expired for client ${client.id}`);
        throw new WsException('Token expired - please refresh your session');
      } else if (errorName === 'JsonWebTokenError') {
        this.logger.warn(
          `Invalid token for client ${client.id}: ${errorMessage}`,
        );
        throw new WsException('Invalid token - please login again');
      } else {
        this.logger.error(
          `Token validation error for client ${client.id}: ${errorMessage}`,
        );
        throw new WsException('Authentication failed - please login again');
      }
    }
  }
}
