import type { ApiClient } from '../http';

export interface DoctorStatsDto {
  doctorId: string;
  consultations: number;
  cancellations: number;
  noShows: number;
  averagePrice: number;
  totalRevenue: number;
  followUpCount: number;
  averageDurationMin: number;
  rating: number | null;
}

export interface TenantStatsDto {
  tenantId: string;
  onlineRevenue: number;
  utilizationPct: number;
  bookingToPaymentConversion: number;
  paymentToShownConversion: number;
  cancellationsByReason: Record<string, number>;
  patientRetentionPct: number;
  bySpecialization: Record<string, number>;
}

export interface PlatformOverviewDto {
  gmv: number;
  takeRate: number;
  netRevenue: number;
  refundRate: number;
  doctorActivation: number;
  averageRevenuePerTenant: number;
  averageRevenuePerDoctor: number;
}

export const analyticsApi = (client: ApiClient) => ({
  doctor: (id: string) => client.get<DoctorStatsDto>(`/analytics/doctor/${id}`),
  tenant: (id: string) => client.get<TenantStatsDto>(`/analytics/tenant/${id}`),
  platformOverview: () => client.get<PlatformOverviewDto>('/analytics/platform/overview'),
});
