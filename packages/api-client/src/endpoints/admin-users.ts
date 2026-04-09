import type {
  AddMembershipDto,
  CreateUserDto,
  ListUsersQuery,
  ResetPasswordResponseDto,
  UserDetailDto,
  UserLookupResponseDto,
  UserStatus,
} from '@telemed/shared-types';
import type { ApiClient } from '../http';

export interface ListUsersResult {
  items: UserDetailDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateUserResult {
  user: UserDetailDto;
  reused: boolean;
  generatedPassword?: string;
}

export const adminUsersApi = (client: ApiClient) => ({
  list: (query: ListUsersQuery = {}) =>
    client.get<ListUsersResult>('/admin/users', { params: query }),

  lookup: (email: string) =>
    client.get<UserLookupResponseDto>('/admin/users/lookup', { params: { email } }),

  getById: (id: string) => client.get<UserDetailDto>(`/admin/users/${id}`),

  create: (dto: CreateUserDto) => client.post<CreateUserResult>('/admin/users', dto),

  addMembership: (id: string, dto: AddMembershipDto) =>
    client.post<UserDetailDto>(`/admin/users/${id}/memberships`, dto),

  revokeMembership: (userId: string, membershipId: string) =>
    client.delete<UserDetailDto>(`/admin/users/${userId}/memberships/${membershipId}`),

  setDefaultMembership: (userId: string, membershipId: string) =>
    client.patch<UserDetailDto>(
      `/admin/users/${userId}/memberships/${membershipId}/default`,
    ),

  setStatus: (id: string, status: UserStatus) =>
    client.patch<UserDetailDto>(`/admin/users/${id}/status`, { status }),

  resetPassword: (id: string) =>
    client.post<ResetPasswordResponseDto>(`/admin/users/${id}/reset-password`),
});
