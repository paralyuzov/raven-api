import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Conversation } from './schemas/conversation.schema';
import { Model } from 'mongoose';

@Injectable()
export class ConversationService {
  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<Conversation>,
  ) {}

  async getOrCreateConversation(participantIds: string[]) {
    const participants = participantIds.sort();
    let conversation = await this.conversationModel.findOne({ participants });
    if (!conversation) {
      conversation = await this.conversationModel.create({ participants });
    }
    return conversation;
  }
}
