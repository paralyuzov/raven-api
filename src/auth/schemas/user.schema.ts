import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true })
  firstName: string;
  @Prop({ required: true })
  lastName: string;
  @Prop({ required: true, unique: true })
  nickname: string;
  @Prop({ required: true, unique: true })
  email: string;
  @Prop({ required: false, default: 'https://example.com/default-avatar.png' })
  avatar: string;
  @Prop({ required: true })
  password: string;
  @Prop({ default: false })
  isOnline: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
