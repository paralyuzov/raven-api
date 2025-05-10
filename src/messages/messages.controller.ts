import { Controller, Post } from '@nestjs/common';

@Controller('messages')
export class MessagesController {
  @Post()
  getMessages() {
    return 'This action returns all messages';
  }
}
