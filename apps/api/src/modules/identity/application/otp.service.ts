import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { OtpCode, OtpChannel } from '../domain/entities/otp-code.entity';
import { MailerService } from '../../../infrastructure/mailer/mailer.service';

const OTP_TTL_SEC = 300;
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectRepository(OtpCode) private readonly repo: Repository<OtpCode>,
    private readonly mailer: MailerService,
  ) {}

  private hash(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  async issue(identifier: string, channel: OtpChannel): Promise<string> {
    // Invalidate previous unconsumed codes for this identifier.
    await this.repo.update(
      { identifier, consumedAt: undefined as never },
      { consumedAt: new Date() },
    );
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const entity = this.repo.create({
      identifier,
      channel,
      codeHash: this.hash(code),
      expiresAt: new Date(Date.now() + OTP_TTL_SEC * 1000),
    });
    await this.repo.save(entity);

    // Deliver
    if (channel === 'EMAIL') {
      try {
        await this.mailer.send({
          to: identifier,
          subject: 'Telemed: ваш одноразовий код',
          text: `Ваш код підтвердження: ${code}\nКод діє 5 хвилин.`,
          html: `<p>Ваш код підтвердження: <strong>${code}</strong></p><p>Код діє 5 хвилин.</p>`,
        });
      } catch (e) {
        this.logger.warn(`Mail delivery failed (dev fallback): ${(e as Error).message}`);
      }
    }
    // SMS — log only in dev/MVP
    this.logger.log(`📱 OTP for ${identifier} (${channel}): ${code}`);
    return code; // dev convenience: returned so seed/tests can pick it up if needed
  }

  async verify(identifier: string, code: string): Promise<boolean> {
    const otp = await this.repo.findOne({
      where: { identifier, consumedAt: null as never },
      order: { createdAt: 'DESC' },
    });
    if (!otp) return false;
    if (otp.expiresAt < new Date()) return false;
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Too many OTP attempts');
    }
    otp.attempts += 1;
    if (otp.codeHash !== this.hash(code)) {
      await this.repo.save(otp);
      return false;
    }
    otp.consumedAt = new Date();
    await this.repo.save(otp);
    return true;
  }

  async cleanupExpired(): Promise<void> {
    await this.repo.delete({ expiresAt: LessThan(new Date(Date.now() - 86400_000)) });
  }
}
