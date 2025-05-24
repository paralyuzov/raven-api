import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Message, MessageType } from './schemas/message.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Conversation } from '../conversation/schemas/conversation.schema';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<Conversation>,
  ) {}

  async createMessage(
    senderId: string,
    conversationId: string,
    content: string,
    type: MessageType = MessageType.TEXT,
  ): Promise<Message> {
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    if (!conversation.participants.some((id) => id.toString() === senderId)) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }

    const message = await this.messageModel.create({
      conversationId,
      senderId,
      content,
      type,
    });

    return message;
  }

  async getMessages(
    conversationId: string,
    userId: string,
  ): Promise<Message[]> {
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    if (!conversation.participants.some((id) => id.toString() === userId)) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }

    return this.messageModel.find({ conversationId }).sort({ createdAt: 1 });
  }

  async markMessagesAsRead(conversationId: string, userId: string) {
    return this.messageModel.updateMany(
      { conversationId, senderId: { $ne: userId }, read: false },
      { $set: { read: true } },
    );
  }
}
