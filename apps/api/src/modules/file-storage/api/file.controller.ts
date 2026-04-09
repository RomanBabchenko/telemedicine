import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';
import { CurrentUser, AuthUser } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { Auditable } from '../../../common/audit/decorators';
import { FileStorageService } from '../application/file-storage.service';

class UploadIntentBody {
  @IsString() purpose!: string;
  @IsString() contentType!: string;
  @IsInt() @Min(1) sizeBytes!: number;
}

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
@UseGuards(JwtAuthGuard)
export class FileController {
  constructor(private readonly service: FileStorageService) {}

  @Post('upload-url')
  @Auditable({ action: 'file.upload-intent', resource: 'FileAsset' })
  async uploadUrl(@CurrentUser() user: AuthUser, @Body() body: UploadIntentBody) {
    return this.service.createUploadIntent(body.purpose, body.contentType, body.sizeBytes, user.id);
  }

  @Get(':id')
  async download(@Param('id') id: string) {
    return this.service.getDownloadUrl(id);
  }
}
