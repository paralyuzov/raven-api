import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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

  @Get('get-friends')
  async getFriends(@GetUser('_id') userId: string) {
    return this.friendsService.getFriendsWithDetails(userId);
  }

  @Get('search-users')
  async searchUsers(
    @GetUser('_id') userId: string,
    @Query('query') query: string,
  ) {
    return this.friendsService.searchUsers(userId, query);
  }

  @Get('pending-requests')
  async getPendingRequests(@GetUser('_id') userId: string) {
    return this.friendsService.getPendingFriendRequests(userId);
  }
}
