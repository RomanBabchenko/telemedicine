import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader } from '@nestjs/swagger';

/**
 * Combined auth headers for authenticated endpoints: Bearer JWT plus the
 * optional X-Tenant-Id tenant selector. Use instead of bare @ApiBearerAuth so
 * the tenant header shows up in every authenticated operation's "Try it out".
 */
export const ApiAuth = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiHeader({
      name: 'X-Tenant-Id',
      description: 'Tenant identifier (UUID) — overrides JWT default tenant',
      required: false,
      schema: { type: 'string', format: 'uuid' },
    }),
  );
