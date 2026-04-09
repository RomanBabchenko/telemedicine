import { Column, Entity, Index, Unique, VersionColumn } from 'typeorm';
import { SlotStatus } from '@telemed/shared-types';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('slots')
// Unique per tenant: the same physical doctor can be exposed in multiple
// clinics simultaneously, each with its own slot row. Without `tenantId`
// in the constraint a second tenant's INSERT silently collapses on
// `ON CONFLICT` and one of the clinics ends up with zero slots.
@Unique('uq_slot_doctor_start', ['tenantId', 'doctorId', 'startAt'])
@Index('idx_slot_tenant_doctor_start', ['tenantId', 'doctorId', 'startAt'])
export class Slot extends TenantOwnedEntity {
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @Column({ name: 'service_type_id', type: 'uuid' })
  serviceTypeId!: string;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt!: Date;

  @Column({ type: 'varchar', length: 16, enum: SlotStatus, default: SlotStatus.OPEN })
  status!: SlotStatus;

  @Column({ name: 'source_is_mis', type: 'boolean', default: false })
  sourceIsMis!: boolean;

  @Column({ name: 'external_slot_id', type: 'varchar', length: 128, nullable: true })
  externalSlotId!: string | null;

  @Column({ name: 'held_until', type: 'timestamptz', nullable: true })
  heldUntil!: Date | null;

  @VersionColumn({ default: 1 })
  version!: number;
}
