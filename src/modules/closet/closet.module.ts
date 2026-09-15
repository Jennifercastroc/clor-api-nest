import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../common/supabase/supabase.module';
import { ClosetController } from './closet.controller';
import { CLOSET_REPOSITORY, SupabaseClosetRepository } from './closet.repository';

@Module({
  imports: [SupabaseModule],
  controllers: [ClosetController],
  providers: [{ provide: CLOSET_REPOSITORY, useClass: SupabaseClosetRepository }],
  exports: [CLOSET_REPOSITORY],
})
export class ClosetModule {}
