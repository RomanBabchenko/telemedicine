import { User } from '../../domain/entities/user.entity';
import { UserDetail } from '../../application/user.service';
import {
  MembershipResponseDto,
  UserDetailResponseDto,
  UserSummaryResponseDto,
} from '../dto/user.response.dto';
import { UserLookupResponseDto } from '../dto/user-lookup.response.dto';
import { MeResponseDto } from '../dto/me.response.dto';
import { Role } from '@telemed/shared-types';

export const toUserSummaryResponse = (user: User): UserSummaryResponseDto => ({
  id: user.id,
  email: user.email,
  phone: user.phone,
  firstName: user.firstName,
  lastName: user.lastName,
  status: user.status,
  mfaEnabled: user.mfaEnabled,
  createdAt: user.createdAt.toISOString(),
});

export const toUserDetailResponse = (detail: UserDetail): UserDetailResponseDto => ({
  id: detail.id,
  email: detail.email,
  phone: detail.phone,
  firstName: detail.firstName,
  lastName: detail.lastName,
  status: detail.status,
  mfaEnabled: detail.mfaEnabled,
  createdAt: detail.createdAt.toISOString(),
  memberships: detail.memberships.map(
    (m): MembershipResponseDto => ({
      id: m.id,
      userId: m.userId,
      tenantId: m.tenantId,
      tenantName: m.tenantName,
      role: m.role,
      isDefault: m.isDefault,
      createdAt: m.createdAt.toISOString(),
    }),
  ),
});

export const toUserLookupResponse = (user: User | null): UserLookupResponseDto =>
  user ? { exists: true, user: toUserSummaryResponse(user) } : { exists: false };

export const toMeResponse = (
  user: User,
  roles: Role[],
  tenantId: string | null,
): MeResponseDto => ({
  id: user.id,
  email: user.email,
  phone: user.phone,
  firstName: user.firstName,
  lastName: user.lastName,
  roles,
  tenantId,
  mfaEnabled: user.mfaEnabled,
});
