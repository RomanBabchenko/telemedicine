import { Column, Entity, Index } from 'typeorm';
import { ParticipantRole } from '@telemed/shared-types';
import { BaseEntity } from '../../../../common/entities/base.entity';

@Entity('appointment_participants')
export class AppointmentParticipant extends BaseEntity {
  @Index()
  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 32, enum: ParticipantRole })
  role!: ParticipantRole;
}
