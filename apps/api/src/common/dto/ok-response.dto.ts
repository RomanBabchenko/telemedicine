import { ApiProperty } from '@nestjs/swagger';

/**
 * Standard acknowledgement for write endpoints that have no meaningful return
 * value (e.g. logout, OTP request, magic link request). Replaces ad-hoc
 * `{ ok: true }` literals so the OpenAPI schema carries a named type.
 */
export class OkResponseDto {
  @ApiProperty({ example: true, description: 'Always true for successful responses' })
  ok!: true;

  static readonly value: OkResponseDto = Object.freeze({ ok: true as const });
}
