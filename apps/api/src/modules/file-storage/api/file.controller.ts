import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { Auditable } from '../../../common/audit/decorators';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { DownloadUrlResponseDto } from '../../patient/api/dto/download-url.response.dto';
import { FileStorageService } from '../application/file-storage.service';
import { UploadIntentBodyDto, UploadIntentResponseDto } from './dto';

@ApiTags('files')
@Controller('files')
@UseGuards(JwtAuthGuard)
@ApiAuth()
export class FileController {
  constructor(private readonly service: FileStorageService) {}

  @Post('upload-url')
  @HttpCode(HttpStatus.CREATED)
  @Auditable({ action: 'file.upload-intent', resource: 'FileAsset' })
  @ApiOperation({
    summary: 'Create an upload intent and obtain a pre-signed PUT URL',
    description:
      'Caller allocates a FileAsset row server-side, receives a short-lived URL to upload the bytes to MinIO directly, then references the returned fileId on its own entity.',
    operationId: 'createFileUploadIntent',
  })
  @ApiBody({ type: UploadIntentBodyDto })
  @ApiCreatedResponse({ type: UploadIntentResponseDto })
  @ApiStandardErrors()
  uploadUrl(
    @CurrentUser() user: AuthUser,
    @Body() body: UploadIntentBodyDto,
  ): Promise<UploadIntentResponseDto> {
    return this.service.createUploadIntent(body.purpose, body.contentType, body.sizeBytes, user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtain a signed download URL for a FileAsset',
    operationId: 'getFileDownloadUrl',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: DownloadUrlResponseDto })
  @ApiStandardErrors()
  download(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DownloadUrlResponseDto> {
    return this.service.getDownloadUrl(id);
  }
}
