import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';
import { Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { AnalyticsService } from '../application/analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('doctor/:id')
  @Roles(Role.DOCTOR, Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  doctor(@Param('id') id: string) {
    return this.service.doctorStats(id);
  }

  @Get('tenant/:id')
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN, Role.PLATFORM_FINANCE)
  tenant(@Param('id') id: string) {
    return this.service.tenantStats(id);
  }

  @Get('platform/overview')
  @Roles(Role.PLATFORM_SUPER_ADMIN, Role.PLATFORM_FINANCE)
  platform() {
    return this.service.platformOverview();
  }
}
