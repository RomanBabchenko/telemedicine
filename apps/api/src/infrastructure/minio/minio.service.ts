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

  // Internal client talks to the actual MinIO server — in prod this is
  // localhost:9000 over plain HTTP for fast intra-host put/get without
  // looping back through ALB + TLS termination.
  private internalClient!: Client;

  // Public client is only used to *sign* presigned URLs handed to browsers.
  // It's identical to internalClient except its endpoint/port/useSSL are
  // wired to whatever public host MinIO is reachable at from the outside
  // (e.g. https://minio.demo.testing-core.link). MinIO validates Sigv4
  // signatures using the same access/secret keys, so signatures generated
  // by this client are accepted by the internal server when nginx
  // forwards the request and preserves the Host header.
  //
  // In dev (no MINIO_PUBLIC_URL) this is the same instance as
  // internalClient, so behaviour is unchanged.
  private signingClient!: Client;

  constructor(private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    this.internalClient = new Client({
      endPoint: this.config.minio.endpoint,
      port: this.config.minio.port,
      useSSL: this.config.minio.useSSL,
      accessKey: this.config.minio.accessKey,
      secretKey: this.config.minio.secretKey,
      region: this.config.minio.region,
    });

    const publicUrl = this.config.minio.publicUrl;
    if (publicUrl) {
      const parsed = new URL(publicUrl);
      const useSSL = parsed.protocol === 'https:';
      this.signingClient = new Client({
        endPoint: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : useSSL ? 443 : 80,
        useSSL,
        accessKey: this.config.minio.accessKey,
        secretKey: this.config.minio.secretKey,
        region: this.config.minio.region,
      });
      this.logger.log(
        `MinIO presigned URLs will be signed against ${publicUrl} (internal endpoint: ${this.config.minio.endpoint}:${this.config.minio.port})`,
      );
    } else {
      this.signingClient = this.internalClient;
    }

    try {
      const exists = await this.internalClient.bucketExists(this.config.minio.bucket);
      if (!exists) {
        await this.internalClient.makeBucket(
          this.config.minio.bucket,
          this.config.minio.region,
        );
        this.logger.log(`Created MinIO bucket "${this.config.minio.bucket}"`);
      }
    } catch (e) {
      this.logger.warn(
        `MinIO bucket check failed (will retry on demand): ${(e as Error).message}`,
      );
    }
  }

  raw(): Client {
    return this.internalClient;
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.internalClient.putObject(
      this.config.minio.bucket,
      input.objectKey,
      input.buffer,
      input.size,
      { 'Content-Type': input.contentType },
    );
  }

  async presignedGet(objectKey: string, expirySeconds = 3600): Promise<string> {
    return this.signingClient.presignedGetObject(
      this.config.minio.bucket,
      objectKey,
      expirySeconds,
    );
  }

  async presignedPut(objectKey: string, expirySeconds = 3600): Promise<string> {
    return this.signingClient.presignedPutObject(
      this.config.minio.bucket,
      objectKey,
      expirySeconds,
    );
  }

  async statObject(objectKey: string) {
    return this.internalClient.statObject(this.config.minio.bucket, objectKey);
  }

  async removeObject(objectKey: string): Promise<void> {
    await this.internalClient.removeObject(this.config.minio.bucket, objectKey);
  }
}
