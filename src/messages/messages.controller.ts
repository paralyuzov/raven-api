import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { GetUser } from 'src/decorators/get-user.decorator';
import { AuthGuard } from 'src/guards/auth.guard';
import { CreateMessageDto } from './dto/create.dto';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(AuthGuard)
export class MessagesController {
  constructor(private readonly messageService: MessagesService) {}

  @Post()
  async createMessage(
    @GetUser('_id') userId: string,
    @Body() messageDto: CreateMessageDto,
  ) {
    return this.messageService.createMessage(
      userId,
      messageDto.receiverId,
      messageDto.content,
      messageDto.type,
    );
  }

  @Get('get-messages')
  async getMessages(
    @GetUser('_id') userId: string,
    @Query('friendId') friendId: string,
  ) {
    console.log(`Fetching messages between ${userId} and ${friendId}`);
    return this.messageService.getMessages(userId, friendId);
  }

  @Get('unread')
  async getUnreadMessages(@GetUser('_id') userId: string) {
    return this.messageService.getUnreadMessageCounts(userId);
  }
}
