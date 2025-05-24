import { IsEnum, IsMongoId, IsNotEmpty, IsString } from 'class-validator';
import { MessageType } from '../schemas/message.schema';

export class CreateMessageDto {
  @IsMongoId()
  @IsNotEmpty()
  conversationId: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsEnum(MessageType)
  type: MessageType = MessageType.TEXT;
}
