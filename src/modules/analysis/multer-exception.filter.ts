import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { MAX_BOARD_IMAGES } from './board-constants';

// Nest envuelve el error de multer (busboy) en un BadRequestException genérico antes de que
// llegue a cualquier filtro - ya no es una instancia de MulterError para ese punto, así que
// hay que reconocerlo por el mensaje crudo ("Unexpected field") en vez de por su clase.
const MULTER_TOO_MANY_FILES_MESSAGE = 'Unexpected field';

@Catch(BadRequestException)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();
    const originalMessage = typeof body === 'string' ? body : (body as { message?: string }).message;

    const message =
      typeof originalMessage === 'string' && originalMessage.startsWith(MULTER_TOO_MANY_FILES_MESSAGE)
        ? `You can upload at most ${MAX_BOARD_IMAGES} images per board`
        : originalMessage;

    response.status(status).json({
      statusCode: status,
      error: 'Bad Request',
      message,
    });
  }
}
