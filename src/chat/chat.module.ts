import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { Message, MessageSchema } from '../messages/schemas/message.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { MessagesModule } from '../messages/messages.module';
import { WsAuthGuard } from 'src/guards/ws-auth.guard';
import { FriendsModule } from 'src/friends/friends.module';
import { ConversationModule } from 'src/conversation/conversation.module';
import {
  Conversation,
  ConversationSchema,
} from '../conversation/schemas/conversation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: Conversation.name, schema: ConversationSchema },
    ]),
    MessagesModule,
    FriendsModule,
    ConversationModule,
  ],
  providers: [ChatGateway, ChatService, WsAuthGuard],
})
export class ChatModule {}
