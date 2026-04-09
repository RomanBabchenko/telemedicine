import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { SlotStatus } from '@telemed/shared-types';
import { Slot } from '../domain/entities/slot.entity';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(Slot) private readonly slots: Repository<Slot>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async listAvailable(
    doctorId: string,
    serviceTypeId: string | undefined,
    from: Date,
    to: Date,
  ): Promise<Slot[]> {
    const tenantId = this.tenantContext.getTenantId();
    const where: Record<string, unknown> = {
      tenantId,
      doctorId,
      startAt: Between(from, to),
      status: SlotStatus.OPEN,
    };
    if (serviceTypeId) where.serviceTypeId = serviceTypeId;
    return this.slots.find({
      where,
      order: { startAt: 'ASC' },
    });
  }

  async findSlotById(slotId: string): Promise<Slot | null> {
    const tenantId = this.tenantContext.getTenantId();
    return this.slots.findOne({ where: { id: slotId, tenantId } });
  }
}
