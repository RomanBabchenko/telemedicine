import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncJobStatus, SyncJobType, VerificationStatus, SlotStatus } from '@telemed/shared-types';
import { ExternalIdentity } from '../domain/entities/external-identity.entity';
import { MisSyncJob } from '../domain/entities/mis-sync-job.entity';
import { TenantIntegrationConfig } from '../domain/entities/tenant-integration-config.entity';
import { Doctor } from '../../provider/domain/entities/doctor.entity';
import { Patient } from '../../patient/domain/entities/patient.entity';
import { Slot } from '../../booking/domain/entities/slot.entity';
import { ServiceType } from '../../booking/domain/entities/service-type.entity';
import { ConnectorRegistry } from './connector.registry';
import { runCrossTenant } from '../../../common/database/cross-tenant.helper';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

@Injectable()
export class SyncJobService {
  private readonly logger = new Logger(SyncJobService.name);

  constructor(
    @InjectRepository(MisSyncJob) private readonly jobs: Repository<MisSyncJob>,
    @InjectRepository(TenantIntegrationConfig)
    private readonly configs: Repository<TenantIntegrationConfig>,
    @InjectRepository(ExternalIdentity)
    private readonly externalIds: Repository<ExternalIdentity>,
    @InjectRepository(Doctor) private readonly doctors: Repository<Doctor>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(Slot) private readonly slots: Repository<Slot>,
    @InjectRepository(ServiceType) private readonly services: Repository<ServiceType>,
    private readonly registry: ConnectorRegistry,
    private readonly tenantContext: TenantContextService,
  ) {}

  async runFullSync(tenantId: string): Promise<MisSyncJob> {
    const config = await this.configs.findOne({ where: { tenantId } });
    if (!config) throw new NotFoundException('No MIS connector configured');
    const connector = this.registry.get(config.connector);

    const job = this.jobs.create({
      tenantId,
      connector: config.connector,
      jobType: SyncJobType.FULL,
      status: SyncJobStatus.RUNNING,
      startedAt: new Date(),
    });
    await this.jobs.save(job);

    try {
      await runCrossTenant(this.tenantContext, async () => {
        const stats = { doctors: 0, patients: 0, slots: 0, services: 0 };

        for (const ext of await connector.listDoctors()) {
          let doctor = await this.findInternalDoctor(tenantId, connector.id, ext.externalId);
          if (!doctor) {
            // Placeholder system user for MIS-imported doctor records that
            // don't have a real platform login yet. Valid RFC v4 format.
            doctor = this.doctors.create({
              userId: '00000000-0000-4000-8000-000000000000',
              firstName: ext.firstName,
              lastName: ext.lastName,
              specializations: [ext.specialization],
              languages: ext.languages,
              yearsOfExperience: ext.yearsOfExperience,
              basePrice: String(ext.basePrice),
              defaultDurationMin: 30,
              verificationStatus: VerificationStatus.VERIFIED,
            });
            doctor = await this.doctors.save(doctor);
            await this.externalIds.save(
              this.externalIds.create({
                tenantId,
                entityType: 'DOCTOR',
                internalId: doctor.id,
                externalSystem: connector.id,
                externalId: ext.externalId,
              }),
            );
          }
          stats.doctors += 1;
        }

        for (const ext of await connector.listPatients()) {
          let patient = await this.findInternalPatient(tenantId, connector.id, ext.externalId);
          if (!patient) {
            patient = this.patients.create({
              firstName: ext.firstName,
              lastName: ext.lastName,
              email: ext.email ?? null,
              phone: ext.phone ?? null,
              dateOfBirth: ext.dateOfBirth ?? null,
              preferredLocale: 'uk',
            });
            patient = await this.patients.save(patient);
            await this.externalIds.save(
              this.externalIds.create({
                tenantId,
                entityType: 'PATIENT',
                internalId: patient.id,
                externalSystem: connector.id,
                externalId: ext.externalId,
              }),
            );
          }
          stats.patients += 1;
        }

        // Service types
        for (const svc of await connector.listServiceTypes()) {
          const doctorId = await this.resolveExternalId(
            tenantId,
            connector.id,
            'DOCTOR',
            svc.doctorExternalId,
          );
          if (!doctorId) continue;
          let serviceTypeId = await this.resolveExternalId(
            tenantId,
            connector.id,
            'SERVICE_TYPE',
            svc.externalId,
          );
          if (!serviceTypeId) {
            const created = await this.services.save(
              this.services.create({
                tenantId,
                doctorId,
                code: 'MIS',
                name: svc.name,
                durationMin: svc.durationMin,
                price: String(svc.price),
              }),
            );
            await this.externalIds.save(
              this.externalIds.create({
                tenantId,
                entityType: 'SERVICE_TYPE',
                internalId: created.id,
                externalSystem: connector.id,
                externalId: svc.externalId,
              }),
            );
            serviceTypeId = created.id;
          }
          stats.services += 1;
        }

        // Slots
        const from = new Date();
        const to = new Date(from.getTime() + 14 * 86400_000);
        for (const ext of await connector.listSlots(from, to)) {
          const doctorId = await this.resolveExternalId(
            tenantId,
            connector.id,
            'DOCTOR',
            ext.doctorExternalId,
          );
          const serviceTypeId = await this.resolveExternalId(
            tenantId,
            connector.id,
            'SERVICE_TYPE',
            ext.serviceTypeExternalId,
          );
          if (!doctorId || !serviceTypeId) continue;
          const startAt = new Date(ext.startAt);
          const endAt = new Date(ext.endAt);
          const exists = await this.slots.findOne({
            where: { tenantId, doctorId, startAt },
          });
          if (exists) continue;
          await this.slots.save(
            this.slots.create({
              tenantId,
              doctorId,
              serviceTypeId,
              startAt,
              endAt,
              status: SlotStatus.OPEN,
              sourceIsMis: true,
              externalSlotId: ext.externalId,
            }),
          );
          stats.slots += 1;
        }

        job.stats = stats;
      });
      job.status = SyncJobStatus.SUCCEEDED;
      config.lastFullSyncAt = new Date();
      await this.configs.save(config);
    } catch (e) {
      job.status = SyncJobStatus.FAILED;
      job.error = (e as Error).message;
      this.logger.error('Full sync failed', e as Error);
    } finally {
      job.finishedAt = new Date();
      await this.jobs.save(job);
    }

    return job;
  }

  async runIncrementalSync(tenantId: string): Promise<MisSyncJob> {
    // For MVP we treat incremental as full + idempotent
    return this.runFullSync(tenantId);
  }

  async status(tenantId: string) {
    const config = await this.configs.findOne({ where: { tenantId } });
    if (!config) return null;
    const errors = await this.jobs.count({
      where: { tenantId, status: SyncJobStatus.FAILED },
    });
    return {
      tenantId,
      connector: config.connector,
      enabled: config.enabled,
      lastFullSyncAt: config.lastFullSyncAt,
      lastIncrementalSyncAt: config.lastIncrementalSyncAt,
      pendingErrors: errors,
    };
  }

  async listErrors(tenantId: string) {
    return this.jobs.find({
      where: { tenantId, status: SyncJobStatus.FAILED },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  private async resolveExternalId(
    tenantId: string,
    externalSystem: string,
    entityType: 'DOCTOR' | 'PATIENT' | 'SERVICE_TYPE' | 'SLOT' | 'APPOINTMENT',
    externalId: string,
  ): Promise<string | null> {
    const row = await this.externalIds.findOne({
      where: { tenantId, externalSystem, entityType, externalId },
    });
    return row?.internalId ?? null;
  }

  private async findInternalDoctor(
    tenantId: string,
    externalSystem: string,
    externalId: string,
  ) {
    const id = await this.resolveExternalId(tenantId, externalSystem, 'DOCTOR', externalId);
    if (!id) return null;
    return this.doctors.findOne({ where: { id } });
  }

  private async findInternalPatient(
    tenantId: string,
    externalSystem: string,
    externalId: string,
  ) {
    const id = await this.resolveExternalId(tenantId, externalSystem, 'PATIENT', externalId);
    if (!id) return null;
    return this.patients.findOne({ where: { id } });
  }
}
