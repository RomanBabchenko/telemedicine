import { Module } from '@nestjs/common';

@Module({})
export class AdminModule {
  // Admin endpoints live in respective modules (TenantController has /admin/tenants/*).
  // This module exists for future cross-cutting platform admin features.
}
