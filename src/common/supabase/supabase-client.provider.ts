import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { Provider } from '@nestjs/common';

export const SUPABASE_CLIENT = 'SUPABASE_CLIENT';

export const supabaseClientProvider: Provider = {
  provide: SUPABASE_CLIENT,
  useFactory: (configService: ConfigService): SupabaseClient => {
    const url = configService.get<string>('supabase.url');
    const anonKey = configService.get<string>('supabase.anonKey');
    if (!url || !anonKey) {
      throw new Error('Supabase configuration is missing');
    }
    return createClient(url, anonKey);
  },
  inject: [ConfigService],
};
