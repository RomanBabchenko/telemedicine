import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'node:crypto';
import { ConsultationInvite } from '../domain/entities/consultation-invite.entity';

const INVITE_TTL_SECONDS = 24 * 3600; // 24 hours

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
  }): Promise<string> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_SECONDS * 1000);

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
    if (invite.consumedAt) return null;
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
}
