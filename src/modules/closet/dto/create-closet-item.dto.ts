import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// closet_items en Supabase solo tiene category/color/description como campos de contenido
// (confirmado contra el schema real) - NO existen pattern/material/style/formality como
// columnas todavía, así que no se incluyen acá aunque el resto del dominio sí los maneje.
export class CreateClosetItemDto {
  @IsString()
  @IsNotEmpty()
  category: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
