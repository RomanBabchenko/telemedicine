import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Standard error envelope returned by HttpExceptionFilter. Shape is preserved
 * for backwards compatibility with existing frontend consumers — additive
 * fields (`error`, `details`, `code`, `traceId`) may be absent on older errors.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 400, description: 'HTTP status code' })
  statusCode!: number;

  @ApiProperty({
    example: 'Validation failed',
    description: 'Human-readable summary; may be localised based on Accept-Language',
  })
  message!: string;

  @ApiPropertyOptional({
    example: 'Bad Request',
    description: 'HTTP status phrase',
  })
  error?: string;

  @ApiProperty({ example: '/api/v1/auth/login', description: 'Request path' })
  path!: string;

  @ApiProperty({
    example: '2026-04-24T09:12:34.000Z',
    description: 'ISO-8601 timestamp when the error was produced',
  })
  timestamp!: string;

  @ApiPropertyOptional({
    example: 'appointment.not_found',
    description: 'Machine-readable error code that frontends can branch on',
  })
  code?: string;

  @ApiPropertyOptional({
    description: 'Additional context (validation errors, conflicting resource id, etc.)',
  })
  details?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Request trace id echoed from X-Request-Id header',
  })
  traceId?: string;
}
