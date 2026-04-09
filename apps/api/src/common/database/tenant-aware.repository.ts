import {
  DeepPartial,
  EntityManager,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantOwnedEntity } from '../entities/tenant-owned.entity';

/**
 * Repository wrapper that automatically scopes queries by tenantId
 * unless the request context explicitly opts into cross-tenant access.
 */
export class TenantAwareRepository<T extends TenantOwnedEntity> {
  protected readonly repo: Repository<T>;

  constructor(
    protected readonly manager: EntityManager,
    protected readonly target: EntityTarget<T>,
    protected readonly tenantContext: TenantContextService,
  ) {
    this.repo = manager.getRepository(target);
  }

  protected get tenantId(): string | null {
    if (this.tenantContext.isCrossTenantAllowed()) return null;
    return this.tenantContext.getTenantId();
  }

  protected withTenant<W extends FindOptionsWhere<T> | FindOptionsWhere<T>[] | undefined>(
    where: W,
  ): W {
    const tid = this.tenantId;
    if (!tid) return where;
    if (Array.isArray(where)) {
      return where.map((w) => ({ ...w, tenantId: tid })) as W;
    }
    return { ...(where ?? ({} as object)), tenantId: tid } as unknown as W;
  }

  qb(alias = 'e'): SelectQueryBuilder<T> {
    const qb = this.repo.createQueryBuilder(alias);
    const tid = this.tenantId;
    if (tid) {
      qb.andWhere(`${alias}.tenant_id = :tid`, { tid });
    }
    return qb;
  }

  find(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repo.find({
      ...options,
      where: this.withTenant(options?.where),
    });
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repo.findOne({
      ...options,
      where: this.withTenant(options.where),
    });
  }

  findOneOrFail(options: FindOneOptions<T>): Promise<T> {
    return this.repo.findOneOrFail({
      ...options,
      where: this.withTenant(options.where),
    });
  }

  findById(id: string, relations?: string[]): Promise<T | null> {
    return this.findOne({
      where: { id } as unknown as FindOptionsWhere<T>,
      relations,
    });
  }

  count(where?: FindOptionsWhere<T>): Promise<number> {
    return this.repo.count({ where: this.withTenant(where) });
  }

  create(data: DeepPartial<T>): T {
    const tid = this.tenantId;
    return this.repo.create({
      ...(data as object),
      ...(tid ? { tenantId: tid } : {}),
    } as DeepPartial<T>);
  }

  save(entity: T): Promise<T>;
  save(entities: T[]): Promise<T[]>;
  save(entity: T | T[]): Promise<T | T[]> {
    if (Array.isArray(entity)) return this.repo.save(entity);
    return this.repo.save(entity);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete({ id, ...(this.tenantId ? { tenantId: this.tenantId } : {}) } as object);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id, ...(this.tenantId ? { tenantId: this.tenantId } : {}) } as object);
  }

  raw(): Repository<T> {
    return this.repo;
  }
}
