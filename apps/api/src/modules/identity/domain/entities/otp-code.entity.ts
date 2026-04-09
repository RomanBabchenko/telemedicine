import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/entities/base.entity';

export type OtpChannel = 'EMAIL' | 'PHONE';

@Entity('otp_codes')
export class OtpCode extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 256 })
  identifier!: string;

  @Column({ type: 'varchar', length: 16 })
  channel!: OtpChannel;

  @Column({ name: 'code_hash', type: 'text' })
  codeHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts!: number;
}
