import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export enum FriendStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  BLOCKED = 'blocked',
}

@Schema({ timestamps: true })
export class Friend extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  userId: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  friendId: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(FriendStatus),
    default: FriendStatus.PENDING,
  })
  status: FriendStatus;
}
export const FriendSchema = SchemaFactory.createForClass(Friend);

FriendSchema.index({ userId: 1, friendId: 1 }, { unique: true });
