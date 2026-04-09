import { Injectable } from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';

@Injectable()
export class MfaService {
  generateSecret(label: string): { secret: string; otpauthUrl: string } {
    const s = speakeasy.generateSecret({ name: `Telemed (${label})`, length: 32 });
    return { secret: s.base32, otpauthUrl: s.otpauth_url ?? '' };
  }

  async makeQrDataUrl(otpauthUrl: string): Promise<string> {
    return QRCode.toDataURL(otpauthUrl);
  }

  verify(secret: string, code: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });
  }
}
