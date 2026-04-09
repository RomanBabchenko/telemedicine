import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@telemed/shared-types';
import { ROLES_KEY } from './decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as { roles?: Role[] } | undefined;
    if (!user?.roles?.length) {
      throw new ForbiddenException('Not authenticated');
    }
    const ok = user.roles.some((r) => required.includes(r));
    if (!ok) {
      throw new ForbiddenException(
        `Insufficient role. Required one of: ${required.join(', ')}`,
      );
    }
    return true;
  }
}
