import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';

interface ErrorExample {
  status: number;
  description: string;
  error: string;
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

const errorExample = (tpl: ErrorExample) => ({
  statusCode: tpl.status,
  message: tpl.message,
  error: tpl.error,
  path: '/api/v1/example',
  timestamp: '2026-04-24T09:12:34.000Z',
  code: tpl.code,
  ...(tpl.details ? { details: tpl.details } : {}),
});

// Per-status error examples. Each response keeps the shared ErrorResponseDto
// schema (so generated SDKs see a typed error) but carries a status-specific
// example — the previous single-example setup made every 4xx/5xx in Swagger
// UI render the same "400 Bad Request" payload.
const ERRORS: ErrorExample[] = [
  {
    status: 400,
    description: 'Validation failed',
    error: 'Bad Request',
    message: 'Validation failed',
    code: 'validation.failed',
    details: { errors: ['email must be an email'] },
  },
  {
    status: 401,
    description: 'Authentication required',
    error: 'Unauthorized',
    message: 'Authentication required',
    code: 'auth.unauthorized',
  },
  {
    status: 403,
    description: 'Caller is not allowed to perform this action',
    error: 'Forbidden',
    message: 'Caller is not allowed to perform this action',
    code: 'auth.forbidden',
  },
  {
    status: 404,
    description: 'Resource not found',
    error: 'Not Found',
    message: 'Appointment abc-123 not found',
    code: 'appointment.not_found',
    details: { resource: 'Appointment', id: 'abc-123' },
  },
  {
    status: 409,
    description: 'State conflict',
    error: 'Conflict',
    message: 'Slot is no longer open',
    code: 'slot.conflict',
  },
  {
    status: 422,
    description: 'Business rule violation',
    error: 'Unprocessable Entity',
    message: 'Appointment is already in terminal state COMPLETED',
    code: 'appointment.invalid_transition',
  },
  {
    status: 500,
    description: 'Unexpected server error',
    error: 'Internal Server Error',
    message: 'Internal server error',
    code: 'internal',
  },
];

const buildResponse = (tpl: ErrorExample, model: Type<unknown>) =>
  ApiResponse({
    status: tpl.status,
    description: tpl.description,
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(model) },
        example: errorExample(tpl),
      },
    },
  });

/**
 * Stamp the common error responses (400/401/403/404/409/422/500) onto a
 * controller method. Each response uses the shared ErrorResponseDto schema
 * with a status-specific example so Swagger UI renders meaningful samples
 * instead of the same 400 payload everywhere.
 */
export const ApiStandardErrors = () =>
  applyDecorators(
    ApiExtraModels(ErrorResponseDto),
    ...ERRORS.map((tpl) => buildResponse(tpl, ErrorResponseDto)),
  );

/**
 * Smaller variant for public auth endpoints — only 400/401/500.
 */
export const ApiAuthErrors = () =>
  applyDecorators(
    ApiExtraModels(ErrorResponseDto),
    ...ERRORS.filter((e) => [400, 401, 500].includes(e.status)).map((tpl) =>
      buildResponse(tpl, ErrorResponseDto),
    ),
  );
