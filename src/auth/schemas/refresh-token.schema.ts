import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

@Schema({ timestamps: true, versionKey: false })
export class RefreshToken extends Document {
  @Prop({ required: true, type: mongoose.Schema.Types.ObjectId })
  userId: string;
  @Prop({ required: true })
  token: string;
  @Prop({ required: true })
  expiresAt: Date;
}
export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
