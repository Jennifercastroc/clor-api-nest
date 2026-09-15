import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { Provider } from '@nestjs/common';

// service_role_key: bypassea RLS. SOLO para uso interno (sync jobs, repositories de
// catálogo) - NUNCA lo inyectes en un guard, controller o cualquier cosa que atienda
// requests directos del usuario. Ese caso usa SUPABASE_CLIENT (anon key, respeta RLS).
export const SUPABASE_SERVICE_CLIENT = 'SUPABASE_SERVICE_CLIENT';

export const supabaseServiceClientProvider: Provider = {
  provide: SUPABASE_SERVICE_CLIENT,
  useFactory: (configService: ConfigService): SupabaseClient => {
    const url = configService.get<string>('supabase.url');
    const serviceRoleKey = configService.get<string>('supabase.serviceRoleKey');
    if (!url || !serviceRoleKey) {
      throw new Error('Supabase service_role configuration is missing');
    }
    return createClient(url, serviceRoleKey);
  },
  inject: [ConfigService],
};
