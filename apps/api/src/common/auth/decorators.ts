import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Role } from '@telemed/shared-types';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const REQUIRE_MFA_KEY = 'requireMfa';
export const RequireMfa = () => SetMetadata(REQUIRE_MFA_KEY, true);

// Invite-scoped tokens are blocked from every authenticated endpoint by
// default. Mark an endpoint with @InviteAccessible() to allow invite-scoped
// callers through. When a contextField is passed, the guard additionally
// verifies that the `:id` route param matches the corresponding field on the
// token's inviteCtx — so an invite holder for appointment A cannot poke at
// session B's endpoints.
export const INVITE_ACCESSIBLE_KEY = 'inviteAccessible';
export type InviteContextField = 'appointmentId' | 'consultationSessionId';
export const InviteAccessible = (contextField?: InviteContextField) =>
  SetMetadata(INVITE_ACCESSIBLE_KEY, contextField ?? true);

export interface InviteContext {
  appointmentId: string;
  consultationSessionId: string;
}

export interface AuthUser {
  // For scope === 'invite-anon' this is a pseudonymous ConsultationInvite.id,
  // not a real User row. Callers persisting this value into FK columns that
  // join to users(id) (audit events, session events, appointments) MUST first
  // check the scope to avoid polluting those tables with invite uuids.
  id: string;
  email: string | null;
  phone: string | null;
  roles: Role[];
  tenantId: string | null;
  mfaEnabled: boolean;
  mfaVerifiedAt?: Date;
  // 'full'        — normal user session (JWT)
  // 'invite'      — named invite-link session, restricted to waiting-room + video
  // 'invite-anon' — anonymous-patient invite; user.id is a pseudonym, no User row
  // 'service'     — machine-to-machine (API key), restricted to /integrations/*
  scope?: 'full' | 'invite' | 'invite-anon' | 'service';
  inviteCtx?: InviteContext;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | null => {
    const req = ctx.switchToHttp().getRequest();
    return req.user ?? null;
  },
);
