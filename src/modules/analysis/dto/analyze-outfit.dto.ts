import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { GENDER_VALUES } from '../../product-search/gender';

export class AnalyzeOutfitDto {
  @IsString()
  @IsNotEmpty()
  city: string;

  // Requerido a propósito: sin esto las búsquedas de producto no distinguen género y
  // devuelven ropa de hombre/mujer mezclada sin criterio - no se infiere con IA de la imagen.
  @IsIn(GENDER_VALUES)
  @IsNotEmpty()
  gender: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  budget?: number;

  @IsOptional()
  @IsString()
  size?: string;
}
