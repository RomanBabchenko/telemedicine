import { Injectable } from '@nestjs/common';
import { hashPassword, verifyPassword } from '../../../common/crypto/password.util';

@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return hashPassword(password);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return verifyPassword(hash, password);
  }
}
