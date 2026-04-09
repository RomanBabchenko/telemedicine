import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

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

    let body: Record<string, unknown> = {
      statusCode: status,
      message: 'Internal server error',
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    };

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        body.message = res;
      } else if (typeof res === 'object' && res !== null) {
        body = { ...body, ...(res as object) };
      }
    } else if (exception instanceof Error) {
      this.logger.error(`${request.method} ${request.originalUrl}: ${exception.message}`, exception.stack);
      body.message = exception.message;
    }

    response.status(status).json(body);
  }
}
