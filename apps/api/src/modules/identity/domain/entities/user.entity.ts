import { Exclude } from 'class-transformer';
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/entities/base.entity';

export type UserStatus = 'ACTIVE' | 'PENDING' | 'BLOCKED';

@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true, where: '"email" IS NOT NULL' })
  @Column({ type: 'citext', nullable: true })
  email!: string | null;

  @Index({ unique: true, where: '"phone" IS NOT NULL' })
  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  // Never serialised over HTTP. ClassSerializerInterceptor strips this if a
  // controller accidentally returns a raw User entity instead of a mapped DTO.
  @Exclude()
  @Column({ name: 'password_hash', type: 'text', nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 128, nullable: true })
  firstName!: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 128, nullable: true })
  lastName!: string | null;

  // Shared TOTP secret. Must never leak — only the generated QR/secret at
  // enrolment time is exposed, and only through the dedicated MFA endpoint.
  @Exclude()
  @Column({ name: 'mfa_secret', type: 'text', nullable: true })
  mfaSecret!: string | null;

  @Column({ name: 'mfa_enabled', type: 'boolean', default: false })
  mfaEnabled!: boolean;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ name: 'phone_verified_at', type: 'timestamptz', nullable: true })
  phoneVerifiedAt!: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status!: UserStatus;
}
