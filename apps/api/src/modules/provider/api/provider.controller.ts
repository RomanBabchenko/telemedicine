import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';
import { Public, Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { ProviderService } from '../application/provider.service';
import { CreateAvailabilityRuleBodyDto, DoctorSearchQueryDto, UpdateDoctorBodyDto } from './dto';

@ApiTags('doctors')
@Controller('doctors')
export class ProviderController {
  constructor(private readonly service: ProviderService) {}

  @Get()
  @Public()
  search(@Query() query: DoctorSearchQueryDto) {
    return this.service.search(query);
  }

  @Get(':id')
  @Public()
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @ApiBearerAuth()
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR, Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'doctor.updated', resource: 'Doctor' })
  update(@Param('id') id: string, @Body() body: UpdateDoctorBodyDto) {
    return this.service.update(id, body);
  }

  @ApiBearerAuth()
  @Post(':id/documents/verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'doctor.verified', resource: 'Doctor' })
  verify(@Param('id') id: string) {
    return this.service.verify(id);
  }

  @ApiBearerAuth()
  @Get(':id/availability')
  @UseGuards(JwtAuthGuard)
  listAvailability(@Param('id') id: string) {
    return this.service.listAvailabilityRules(id);
  }

  @ApiBearerAuth()
  @Post(':id/availability')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR, Role.CLINIC_ADMIN)
  @Auditable({ action: 'availability.rule.created', resource: 'AvailabilityRule' })
  createAvailability(@Param('id') id: string, @Body() body: CreateAvailabilityRuleBodyDto) {
    return this.service.createAvailabilityRule(id, body);
  }

  @ApiBearerAuth()
  @Delete(':id/availability/:ruleId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR, Role.CLINIC_ADMIN)
  @Auditable({ action: 'availability.rule.deleted', resource: 'AvailabilityRule' })
  deleteAvailability(@Param('id') id: string, @Param('ruleId') ruleId: string) {
    return this.service.deleteAvailabilityRule(id, ruleId);
  }
}
