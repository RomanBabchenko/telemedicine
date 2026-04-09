import { Column, Entity, Index } from 'typeorm';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('availability_rules')
export class AvailabilityRule extends TenantOwnedEntity {
  @Index()
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @Column({ type: 'int' })
  weekday!: number;

  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime!: string;

  @Column({ name: 'buffer_min', type: 'int', default: 0 })
  bufferMin!: number;

  @Column({ name: 'service_type_id', type: 'uuid', nullable: true })
  serviceTypeId!: string | null;

  @Column({ name: 'valid_from', type: 'date', nullable: true })
  validFrom!: string | null;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil!: string | null;
}
