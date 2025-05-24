import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { AuthGuard } from '../guards/auth.guard';
import { GetUser } from '../decorators/get-user.decorator';

@Controller('conversation')
@UseGuards(AuthGuard)
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post('get-or-create')
  async getOrCreate(
    @GetUser('_id') userId: string,
    @Body('participantId') participantId: string,
  ) {
    return this.conversationService.getOrCreateConversation([
      userId,
      participantId,
    ]);
  }
}
