import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { AppConfig } from '../../config/env.config';

export interface SendMailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter!: Transporter;

  constructor(private readonly config: AppConfig) {}

  onModuleInit(): void {
    this.transporter = nodemailer.createTransport({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: false,
      auth:
        this.config.smtp.user && this.config.smtp.password
          ? { user: this.config.smtp.user, pass: this.config.smtp.password }
          : undefined,
    });
  }

  async send(input: SendMailInput): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.config.smtp.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      this.logger.debug(`Mail sent to ${input.to}: ${input.subject}`);
    } catch (e) {
      this.logger.error(`Failed to send mail to ${input.to}`, e as Error);
      throw e;
    }
  }
}
