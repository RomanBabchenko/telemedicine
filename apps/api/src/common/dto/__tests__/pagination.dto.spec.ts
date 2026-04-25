import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto, buildPaginationMeta } from '../pagination.dto';

describe('PaginationQueryDto', () => {
  it('applies the default page and limit when omitted', async () => {
    const dto = plainToInstance(PaginationQueryDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('coerces numeric query strings to numbers', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: '3', limit: '50' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(50);
  });

  it('rejects limit above 100', async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: '500' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-"asc"/"desc" order', async () => {
    const dto = plainToInstance(PaginationQueryDto, { order: 'ascending' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('buildPaginationMeta', () => {
  it('rounds pageCount up for a partial last page', () => {
    expect(buildPaginationMeta(45, 1, 20)).toEqual({
      total: 45,
      page: 1,
      limit: 20,
      pageCount: 3,
    });
  });

  it('returns pageCount 0 when limit is 0', () => {
    expect(buildPaginationMeta(10, 1, 0)).toEqual({
      total: 10,
      page: 1,
      limit: 0,
      pageCount: 0,
    });
  });
});
