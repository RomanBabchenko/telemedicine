import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { Auditable } from '../../../common/audit/decorators';
import { Idempotent } from '../../../common/decorators/idempotent.decorator';
import { OkResponseDto } from '../../../common/dto/ok-response.dto';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { PaymentService } from '../application/payment.service';
import {
  CreateIntentBodyDto,
  PaymentIntentResponseDto,
  PaymentResponseDto,
  ProviderParamDto,
  WebhookAckResponseDto,
} from './dto';
import { toPaymentResponse } from './mappers/payment.mapper';

@ApiTags('payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  @Post('intent')
  @UseGuards(JwtAuthGuard)
  @Auditable({ action: 'payment.intent.created', resource: 'Payment' })
  @Idempotent()
  @ApiAuth()
  @ApiOperation({
    summary: 'Create a payment intent for an appointment',
    description:
      'Creates a provider-side intent (Stripe, LiqPay, etc.) and a Payment row. Anonymous MIS appointments cannot have intents — they are gated via the MIS prepaid flow. Supports Idempotency-Key header — replays return the cached response.',
    operationId: 'createPaymentIntent',
  })
  @ApiBody({ type: CreateIntentBodyDto })
  @ApiCreatedResponse({ type: PaymentIntentResponseDto })
  @ApiStandardErrors()
  createIntent(@Body() body: CreateIntentBodyDto): Promise<PaymentIntentResponseDto> {
    return this.service.createIntent(body.appointmentId);
  }

  @Post('webhook/:provider')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Auditable({ action: 'payment.webhook.received', resource: 'Payment' })
  @ApiOperation({
    summary: 'Receive a provider webhook',
    description:
      'Raw-body endpoint — HMAC signature is verified against req.rawBody. Content type may be application/json or application/webhook+json. Providers retry on any non-2xx, so this endpoint always returns 200 when the request is structurally valid.',
    operationId: 'receivePaymentWebhook',
  })
  @ApiParam({ name: 'provider', description: 'Provider identifier (stub, stripe, liqpay, ...)' })
  @ApiOkResponse({ type: WebhookAckResponseDto })
  async webhook(
    @Param() _params: ProviderParamDto,
    @Req() req: Request,
  ): Promise<WebhookAckResponseDto> {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k.toLowerCase()] = v;
    }
    // req.rawBody is populated by the rawBody:true bootstrap option so
    // providers can verify HMAC against the bytes we received.
    const body = (req as Request & { rawBody?: Buffer }).rawBody ?? JSON.stringify(req.body);
    await this.service.handleWebhook(body, headers);
    return WebhookAckResponseDto.value;
  }

  @Post('stub/succeed/:intentId')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Auditable({ action: 'payment.stub.succeed', resource: 'Payment' })
  @ApiExcludeEndpoint()
  async stubSucceed(@Param('intentId') intentId: string): Promise<OkResponseDto> {
    await this.service.stubSimulateSuccess(intentId);
    return OkResponseDto.value;
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @ApiOperation({
    summary: 'Fetch a payment row',
    operationId: 'getPaymentById',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiStandardErrors()
  async getById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PaymentResponseDto> {
    const payment = await this.service.getById(id);
    return toPaymentResponse(payment);
  }
}
