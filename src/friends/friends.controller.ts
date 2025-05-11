import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { AuthGuard } from '../guards/auth.guard';
import { GetUser } from '../decorators/get-user.decorator';

@Controller('friends')
@UseGuards(AuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Post('send-request')
  async sendFriendRequest(
    @GetUser('_id') userId: string,
    @Body('receiverId') receiverId: string,
  ) {
    return this.friendsService.sendFriendRequest({
      userId,
      receiverId,
    });
  }

  @Post('accept-request')
  async acceptFriendRequest(
    @GetUser('_id') userId: string,
    @Body('friendId') friendId: string,
  ) {
    return this.friendsService.acceptFriendRequest({
      userId,
      receiverId: friendId,
    });
  }

  @Post('reject-request')
  async rejectFriendRequest(
    @GetUser('_id') userId: string,
    @Body('friendId') friendId: string,
  ) {
    return this.friendsService.rejectFriendRequest({
      userId,
      receiverId: friendId,
    });
  }
}
