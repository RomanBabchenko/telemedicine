import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_MFA_KEY } from './decorators';

@Injectable()
export class MfaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requireMfa = this.reflector.getAllAndOverride<boolean>(REQUIRE_MFA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requireMfa) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as { mfaEnabled?: boolean; mfaVerifiedAt?: Date } | undefined;
    if (!user?.mfaEnabled || !user.mfaVerifiedAt) {
      throw new ForbiddenException('MFA verification required for this operation');
    }
    return true;
  }
}
