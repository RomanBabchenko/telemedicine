import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';
import { AuthUser, CurrentUser, Roles } from '../../../common/auth/decorators';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { AnalyticsService } from '../application/analytics.service';
import {
  DoctorStatsResponseDto,
  PlatformOverviewResponseDto,
  TenantStatsResponseDto,
} from './dto';
import { RequireFeature } from '../../../common/tenant/decorators';

// Clinic-level roles take :id from the URL — without this check any clinic
// admin could read a foreign tenant's stats by swapping the UUID.
const PLATFORM_WIDE_ROLES: readonly Role[] = [Role.PLATFORM_SUPER_ADMIN, Role.PLATFORM_FINANCE];
const assertOwnTenant = (user: AuthUser, tenantId: string): void => {
  if (user.roles.some((r) => PLATFORM_WIDE_ROLES.includes(r))) return;
  if (user.tenantId !== tenantId) {
    throw new ForbiddenException('You may only access your own tenant');
  }
};

@ApiTags('analytics')
@Controller('analytics')
@UseGuards(RolesGuard)
@ApiAuth()
@RequireFeature('analyticsPackage')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('doctor/:id')
  @Roles(Role.DOCTOR, Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @ApiOperation({
    summary: "Fetch a doctor's aggregated stats",
    operationId: 'getDoctorStats',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Doctor id' })
  @ApiOkResponse({ type: DoctorStatsResponseDto })
  @ApiStandardErrors()
  doctor(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DoctorStatsResponseDto> {
    return this.service.doctorStats(id);
  }

  @Get('tenant/:id')
  @Roles(
    Role.CLINIC_ADMIN,
    Role.PLATFORM_SUPER_ADMIN,
    Role.PLATFORM_FINANCE,
    Role.INTEGRATION_ADMIN,
    Role.CHIEF_MEDICAL_OFFICER,
  )
  @ApiOperation({
    summary: "Fetch a tenant's aggregated stats",
    description: 'Clinic-level roles may only read their own tenant; platform roles may read any.',
    operationId: 'getTenantStats',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Tenant id' })
  @ApiOkResponse({ type: TenantStatsResponseDto })
  @ApiStandardErrors()
  tenant(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<TenantStatsResponseDto> {
    assertOwnTenant(user, id);
    return this.service.tenantStats(id);
  }

  @Get('platform/overview')
  @Roles(Role.PLATFORM_SUPER_ADMIN, Role.PLATFORM_FINANCE)
  @ApiOperation({
    summary: 'Platform-wide aggregated overview (GMV, take rate, net revenue, refund rate)',
    operationId: 'getPlatformOverview',
  })
  @ApiOkResponse({ type: PlatformOverviewResponseDto })
  @ApiStandardErrors()
  platform(): Promise<PlatformOverviewResponseDto> {
    return this.service.platformOverview();
  }
}
