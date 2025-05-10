import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';

export class FriendRequestDto {
  @IsNotEmpty()
  @IsString()
  @IsMongoId()
  userId: string;

  @IsNotEmpty()
  @IsString()
  @IsMongoId()
  receiverId: string;
}
