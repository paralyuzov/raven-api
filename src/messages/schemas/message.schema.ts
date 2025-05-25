import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  GIF = 'gif',
}

@Schema({ timestamps: true })
export class Message extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  })
  conversationId: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  senderId: mongoose.Schema.Types.ObjectId;

  @Prop({ required: true })
  content: string;

  @Prop({ default: false })
  read: boolean;

  @Prop({ type: String, enum: MessageType, default: MessageType.TEXT })
  type: MessageType;

  @Prop()
  originalFileName?: string;

  @Prop()
  fileSize?: number;

  @Prop()
  mimeType?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}
export const MessageSchema = SchemaFactory.createForClass(Message);
