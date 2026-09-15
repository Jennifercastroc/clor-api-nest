import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase-client.provider';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email?: string;
  };
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabaseClient: SupabaseClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    // Esto hace una llamada de red a Supabase en cada request autenticado. Para un MVP de
    // 2 días es la opción correcta (simple, correcta, sin manejar JWT secrets a mano), pero
    // es una oportunidad de optimización post-competencia: verificar el JWT localmente con
    // el secreto del proyecto evitaría esta latencia extra.
    const { data, error } = await this.supabaseClient.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.user = {
      id: data.user.id,
      email: data.user.email,
    };

    return true;
  }
}
