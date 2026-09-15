import { Body, Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import type { AuthenticatedRequest } from '../../common/guards/supabase-auth.guard';
import { CLOSET_REPOSITORY, type ClosetRepository } from './closet.repository';
import { CreateClosetItemDto } from './dto/create-closet-item.dto';

@Controller('closet')
@UseGuards(SupabaseAuthGuard)
export class ClosetController {
  constructor(@Inject(CLOSET_REPOSITORY) private readonly repository: ClosetRepository) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    return this.repository.listByUser(request.user.id);
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() dto: CreateClosetItemDto) {
    return this.repository.create(request.user.id, dto);
  }
}
