// Fuente única de verdad para los valores de género válidos - usado tanto por el DTO
// (validación en runtime con @IsIn) como por MissingGarment/FilterConstraints (tipado).
export const GENDER_VALUES = ['mujer', 'hombre', 'unisex'] as const;
export type Gender = (typeof GENDER_VALUES)[number];
