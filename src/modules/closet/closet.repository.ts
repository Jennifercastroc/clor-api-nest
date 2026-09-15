import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_CLIENT } from '../../common/supabase/supabase-service-client.provider';
import type { CreateClosetItemDto } from './dto/create-closet-item.dto';

export interface ClosetItem {
  id: string;
  userId: string;
  category: string;
  color: string | null;
  description: string | null;
  status: string;
  createdAt: string;
}

export const CLOSET_REPOSITORY = 'CLOSET_REPOSITORY';

export interface ClosetRepository {
  listByUser(userId: string): Promise<ClosetItem[]>;
  create(userId: string, dto: CreateClosetItemDto): Promise<ClosetItem>;
}

function mapRow(row: Record<string, unknown>): ClosetItem {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    category: row.category as string,
    color: (row.color as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    status: row.status as string,
    createdAt: row.created_at as string,
  };
}

@Injectable()
export class SupabaseClosetRepository implements ClosetRepository {
  constructor(@Inject(SUPABASE_SERVICE_CLIENT) private readonly supabase: SupabaseClient) {}

  async listByUser(userId: string): Promise<ClosetItem[]> {
    // Se usa el service_role_client, así que el filtro por user_id acá es lo único que
    // impide ver clósets ajenos - no hay RLS de por medio en esta ruta.
    const { data, error } = await this.supabase
      .from('closet_items')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to list closet items for user ${userId}: ${error.message}`);
    }

    return (data ?? []).map(mapRow);
  }

  async create(userId: string, dto: CreateClosetItemDto): Promise<ClosetItem> {
    const { data, error } = await this.supabase
      .from('closet_items')
      .insert({
        user_id: userId,
        category: dto.category,
        color: dto.color ?? null,
        description: dto.description ?? null,
        status: 'have',
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create closet item for user ${userId}: ${error?.message}`);
    }

    return mapRow(data);
  }
}
