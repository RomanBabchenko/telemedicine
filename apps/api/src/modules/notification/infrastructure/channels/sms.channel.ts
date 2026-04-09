import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SmsChannel {
  readonly id = 'SMS';
  private readonly logger = new Logger(SmsChannel.name);

  async send(input: { to: string; body: string }): Promise<void> {
    // Stub: in MVP we just log SMS payloads. Replace with Twilio/Vonage adapter later.
    this.logger.log(`📱 SMS to ${input.to}: ${input.body}`);
  }
}
