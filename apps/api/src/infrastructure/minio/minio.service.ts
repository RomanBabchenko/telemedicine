import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from 'minio';
import { Readable } from 'node:stream';
import { AppConfig } from '../../config/env.config';

export interface PutObjectInput {
  objectKey: string;
  buffer: Buffer | Readable;
  contentType: string;
  size?: number;
}

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client!: Client;

  constructor(private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    this.client = new Client({
      endPoint: this.config.minio.endpoint,
      port: this.config.minio.port,
      useSSL: this.config.minio.useSSL,
      accessKey: this.config.minio.accessKey,
      secretKey: this.config.minio.secretKey,
      region: this.config.minio.region,
    });
    try {
      const exists = await this.client.bucketExists(this.config.minio.bucket);
      if (!exists) {
        await this.client.makeBucket(this.config.minio.bucket, this.config.minio.region);
        this.logger.log(`Created MinIO bucket "${this.config.minio.bucket}"`);
      }
    } catch (e) {
      this.logger.warn(
        `MinIO bucket check failed (will retry on demand): ${(e as Error).message}`,
      );
    }
  }

  raw(): Client {
    return this.client;
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.client.putObject(
      this.config.minio.bucket,
      input.objectKey,
      input.buffer,
      input.size,
      { 'Content-Type': input.contentType },
    );
  }

  async presignedGet(objectKey: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(this.config.minio.bucket, objectKey, expirySeconds);
  }

  async presignedPut(objectKey: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedPutObject(this.config.minio.bucket, objectKey, expirySeconds);
  }

  async statObject(objectKey: string) {
    return this.client.statObject(this.config.minio.bucket, objectKey);
  }

  async removeObject(objectKey: string): Promise<void> {
    await this.client.removeObject(this.config.minio.bucket, objectKey);
  }
}
