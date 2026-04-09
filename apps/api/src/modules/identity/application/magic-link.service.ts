import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { MagicLinkToken } from '../domain/entities/magic-link-token.entity';
import { MailerService } from '../../../infrastructure/mailer/mailer.service';

const MAGIC_LINK_TTL_SEC = 900;

@Injectable()
export class MagicLinkService {
  private readonly logger = new Logger(MagicLinkService.name);

  constructor(
    @InjectRepository(MagicLinkToken) private readonly repo: Repository<MagicLinkToken>,
    private readonly mailer: MailerService,
  ) {}

  private hash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async issue(email: string): Promise<string> {
    const tokenRaw = crypto.randomBytes(32).toString('hex');
    const entity = this.repo.create({
      tokenHash: this.hash(tokenRaw),
      email,
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_SEC * 1000),
    });
    await this.repo.save(entity);

    const link = `http://localhost:5173/auth/magic?token=${tokenRaw}`;
    try {
      await this.mailer.send({
        to: email,
        subject: 'Telemed: вхід без пароля',
        text: `Перейдіть за посиланням для входу: ${link}\nПосилання діє 15 хвилин.`,
        html: `<p>Перейдіть за <a href="${link}">посиланням</a> для входу.</p>`,
      });
    } catch (e) {
      this.logger.warn(`Mail delivery failed (dev fallback): ${(e as Error).message}`);
    }
    this.logger.log(`🔗 Magic link for ${email}: ${link}`);
    return tokenRaw;
  }

  async consume(tokenRaw: string): Promise<string | null> {
    const t = await this.repo.findOne({ where: { tokenHash: this.hash(tokenRaw) } });
    if (!t || t.consumedAt || t.expiresAt < new Date()) return null;
    t.consumedAt = new Date();
    await this.repo.save(t);
    return t.email;
  }
}
