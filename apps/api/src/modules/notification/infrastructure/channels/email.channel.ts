import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '../../../../infrastructure/mailer/mailer.service';

@Injectable()
export class EmailChannel {
  readonly id = 'EMAIL';
  private readonly logger = new Logger(EmailChannel.name);

  constructor(private readonly mailer: MailerService) {}

  async send(input: { to: string; subject: string; body: string; html?: string }): Promise<void> {
    await this.mailer.send({
      to: input.to,
      subject: input.subject,
      text: input.body,
      html: input.html ?? `<p>${input.body}</p>`,
    });
  }
}
