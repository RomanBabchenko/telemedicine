import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { randomBytes, createHash } from 'node:crypto';
import { ConsultationInvite } from '../domain/entities/consultation-invite.entity';

// Grace period after the appointment's scheduled end during which the invite
// link still resolves (in case the consultation ran over / patient reconnects).
const INVITE_EXPIRY_GRACE_MS = 30 * 60 * 1000;

@Injectable()
export class ConsultationInviteService {
  constructor(
    @InjectRepository(ConsultationInvite)
    private readonly invites: Repository<ConsultationInvite>,
  ) {}

  async issue(params: {
    tenantId: string;
    appointmentId: string;
    consultationSessionId: string;
    userId: string;
    role: 'PATIENT' | 'DOCTOR';
    appointmentEndAt: Date;
  }): Promise<string> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    // Link life is tied to the appointment — once the meeting ends (+ grace),
    // the link is dead. No more "linger for 24h after the call".
    const expiresAt = new Date(
      params.appointmentEndAt.getTime() + INVITE_EXPIRY_GRACE_MS,
    );

    await this.invites.save(
      this.invites.create({
        tenantId: params.tenantId,
        tokenHash,
        appointmentId: params.appointmentId,
        consultationSessionId: params.consultationSessionId,
        userId: params.userId,
        role: params.role,
        expiresAt,
      }),
    );

    return rawToken;
  }

  // Multi-consume: the same invite token can be consumed repeatedly within
  // its TTL (each consume issues a fresh JWT). Patients click the email link
  // whenever they need to enter the waiting room — closing the tab or losing
  // a short-lived JWT should not lock them out. `consumedAt` stores the
  // timestamp of the *most recent* consume (for audit), not a one-shot flag.
  async consume(rawToken: string): Promise<{
    userId: string;
    tenantId: string;
    role: 'PATIENT' | 'DOCTOR';
    appointmentId: string;
    consultationSessionId: string;
  } | null> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const invite = await this.invites.findOne({ where: { tokenHash } });
    if (!invite) return null;
    if (invite.revokedAt) return null;
    if (invite.expiresAt < new Date()) return null;

    invite.consumedAt = new Date();
    await this.invites.save(invite);

    return {
      userId: invite.userId,
      tenantId: invite.tenantId,
      role: invite.role,
      appointmentId: invite.appointmentId,
      consultationSessionId: invite.consultationSessionId,
    };
  }

  /**
   * Revoke every still-active invite for an appointment. Already-revoked
   * rows are ignored (idempotent). Returns the number of newly revoked
   * entries — useful so the caller can surface "0 links were active" vs
   * actual operation results.
   *
   * Scope:
   *   - role=undefined → revoke both patient and doctor invites
   *   - role='PATIENT' → only patient-side links
   *   - role='DOCTOR'  → only doctor-side links
   */
  async revokeForAppointment(
    tenantId: string,
    appointmentId: string,
    role?: 'PATIENT' | 'DOCTOR',
  ): Promise<number> {
    const where: Record<string, unknown> = {
      tenantId,
      appointmentId,
      revokedAt: IsNull(),
    };
    if (role) where.role = role;
    const result = await this.invites.update(where, { revokedAt: new Date() });
    return result.affected ?? 0;
  }
}
