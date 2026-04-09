import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileAsset } from './domain/entities/file-asset.entity';
import { FileStorageService } from './application/file-storage.service';
import { FileController } from './api/file.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([FileAsset])],
  providers: [FileStorageService],
  controllers: [FileController],
  exports: [FileStorageService],
})
export class FileStorageModule {}
