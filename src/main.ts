import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { MulterExceptionFilter } from './modules/analysis/multer-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
  app.enableCors({ origin: frontendUrl });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );
  // Los errores de Multer (ej. exceder MAX_BOARD_IMAGES) ocurren en la capa de middleware,
  // antes del pipeline de filtros a nivel de ruta - solo un filtro global los intercepta.
  app.useGlobalFilters(new MulterExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
