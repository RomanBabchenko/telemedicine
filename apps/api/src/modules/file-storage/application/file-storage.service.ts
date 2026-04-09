import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { FileAsset } from '../domain/entities/file-asset.entity';
import { MinioService } from '../../../infrastructure/minio/minio.service';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { AppConfig } from '../../../config/env.config';

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'audio/ogg',
  'audio/mpeg',
  'audio/wav',
  'text/plain',
]);

const MAX_SIZE_BYTES = 25 * 1024 * 1024;

@Injectable()
export class FileStorageService {
  constructor(
    @InjectRepository(FileAsset) private readonly repo: Repository<FileAsset>,
    private readonly minio: MinioService,
    private readonly tenantContext: TenantContextService,
    private readonly config: AppConfig,
  ) {}

  async createUploadIntent(
    purpose: string,
    contentType: string,
    sizeBytes: number,
    uploadedByUserId: string | null,
  ) {
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new BadRequestException(`Content type "${contentType}" is not allowed`);
    }
    if (sizeBytes > MAX_SIZE_BYTES) {
      throw new BadRequestException(`File too large (max ${MAX_SIZE_BYTES} bytes)`);
    }

    const tenantId = this.tenantContext.getTenantId();
    const objectKey = `${tenantId}/${purpose}/${uuid()}`;
    const bucket = this.config.minio.bucket;

    const asset = this.repo.create({
      tenantId,
      bucket,
      objectKey,
      contentType,
      sizeBytes: String(sizeBytes),
      purpose,
      uploadedByUserId,
      accessPolicy: { scope: 'tenant' },
    });
    await this.repo.save(asset);

    const presignedUrl = await this.minio.presignedPut(objectKey);
    return { fileId: asset.id, objectKey, uploadUrl: presignedUrl };
  }

  async storeFromBuffer(input: {
    purpose: string;
    contentType: string;
    buffer: Buffer;
    uploadedByUserId?: string | null;
    objectKeyHint?: string;
  }): Promise<FileAsset> {
    const tenantId = this.tenantContext.getTenantId();
    const objectKey = input.objectKeyHint ?? `${tenantId}/${input.purpose}/${uuid()}`;
    await this.minio.putObject({
      objectKey,
      buffer: input.buffer,
      contentType: input.contentType,
      size: input.buffer.length,
    });
    const asset = this.repo.create({
      tenantId,
      bucket: this.config.minio.bucket,
      objectKey,
      contentType: input.contentType,
      sizeBytes: String(input.buffer.length),
      purpose: input.purpose,
      uploadedByUserId: input.uploadedByUserId ?? null,
      accessPolicy: { scope: 'tenant' },
    });
    return this.repo.save(asset);
  }

  async getById(id: string): Promise<FileAsset> {
    const tenantId = this.tenantContext.getTenantId();
    const asset = await this.repo.findOne({ where: { id, tenantId } });
    if (!asset) throw new NotFoundException('File not found');
    return asset;
  }

  async getDownloadUrl(id: string): Promise<{ url: string }> {
    const asset = await this.getById(id);
    const url = await this.minio.presignedGet(asset.objectKey);
    return { url };
  }

  async assertAccessibleByTenant(id: string): Promise<FileAsset> {
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    const asset = await this.getById(id);
    try {
      await this.minio.removeObject(asset.objectKey);
    } catch {
      // ignore — best effort
    }
    await this.repo.delete({ id: asset.id });
  }
}
