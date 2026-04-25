import { ApiProperty } from '@nestjs/swagger';

/**
 * Webhook acknowledgement payload. Providers treat any 2xx response as
 * "delivered"; we keep a stable `received: true` body for observability.
 */
export class WebhookAckResponseDto {
  @ApiProperty({ example: true })
  received!: true;

  static readonly value: WebhookAckResponseDto = Object.freeze({ received: true as const });
}
