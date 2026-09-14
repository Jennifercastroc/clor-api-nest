import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class AnalyzeOutfitDto {
  @IsString()
  @IsNotEmpty()
  city: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  budget?: number;

  @IsOptional()
  @IsString()
  size?: string;
}
