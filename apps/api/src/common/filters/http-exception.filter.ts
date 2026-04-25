import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorResponseDto } from '../dto/error-response.dto';

const STATUS_PHRASES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const traceId =
      (request.header('x-request-id') ||
        request.header('x-trace-id') ||
        undefined);

    const body: ErrorResponseDto = {
      statusCode: status,
      message: 'Internal server error',
      error: STATUS_PHRASES[status] ?? 'Error',
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      ...(traceId ? { traceId } : {}),
    };

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        body.message = res;
      } else if (typeof res === 'object' && res !== null) {
        const payload = res as Record<string, unknown>;
        if (typeof payload.message === 'string') body.message = payload.message;
        else if (Array.isArray(payload.message)) {
          body.message = payload.message.join('; ');
          body.details = { ...(body.details ?? {}), errors: payload.message };
        }
        if (typeof payload.error === 'string') body.error = payload.error;
        if (typeof payload.code === 'string') body.code = payload.code;
        if (payload.details && typeof payload.details === 'object') {
          body.details = {
            ...(body.details ?? {}),
            ...(payload.details as Record<string, unknown>),
          };
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `${request.method} ${request.originalUrl}: ${exception.message}`,
        exception.stack,
      );
      body.message = exception.message;
    }

    response.status(status).json(body);
  }
}
