import type { NotificationDto, NotificationPrefsDto } from '@telemed/shared-types';
import type { ApiClient } from '../http';

export const notificationsApi = (client: ApiClient) => ({
  list: () => client.get<NotificationDto[]>('/notifications'),
  markRead: (id: string) => client.post<{ ok: true }>(`/notifications/${id}/read`),
  prefs: () => client.get<NotificationPrefsDto>('/users/me/notification-prefs'),
  updatePrefs: (dto: NotificationPrefsDto) =>
    client.patch<NotificationPrefsDto>('/users/me/notification-prefs', dto),
});
