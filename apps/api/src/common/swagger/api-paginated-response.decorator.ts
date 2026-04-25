import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../dto/pagination.dto';

/**
 * Swagger decorator that documents a paginated endpoint.
 *
 * Emits `allOf`: the generic `PaginatedResponseDto` envelope plus a concrete
 * `items: model[]` property — so generated OpenAPI clients see the element
 * type directly rather than `items: object[]`.
 */
export const ApiPaginatedResponse = <T extends Type<unknown>>(
  model: T,
  options: { description?: string } = {},
) =>
  applyDecorators(
    ApiExtraModels(PaginatedResponseDto, model),
    ApiOkResponse({
      description: options.description ?? 'Paginated response',
      schema: {
        allOf: [
          { $ref: getSchemaPath(PaginatedResponseDto) },
          {
            properties: {
              items: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
            },
          },
        ],
      },
    }),
  );
