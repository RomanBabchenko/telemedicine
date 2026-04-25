import {
  Controller,
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
import { Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { AnalyticsService } from '../application/analytics.service';
import {
  DoctorStatsResponseDto,
  PlatformOverviewResponseDto,
  TenantStatsResponseDto,
} from './dto';

@ApiTags('analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
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
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN, Role.PLATFORM_FINANCE)
  @ApiOperation({
    summary: "Fetch a tenant's aggregated stats",
    operationId: 'getTenantStats',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Tenant id' })
  @ApiOkResponse({ type: TenantStatsResponseDto })
  @ApiStandardErrors()
  tenant(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TenantStatsResponseDto> {
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
