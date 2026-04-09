import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { Auditable } from '../../../common/audit/decorators';
import { PaymentService } from '../application/payment.service';
import { CreateIntentBodyDto } from './dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  @Post('intent')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Auditable({ action: 'payment.intent.created', resource: 'Payment' })
  createIntent(@Body() body: CreateIntentBodyDto) {
    return this.service.createIntent(body.appointmentId);
  }

  @Post('webhook/:provider')
  @Public()
  @Auditable({ action: 'payment.webhook.received', resource: 'Payment' })
  async webhook(@Param('provider') _provider: string, @Req() req: Request) {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k.toLowerCase()] = v;
    }
    const body = (req as Request & { rawBody?: Buffer }).rawBody ?? JSON.stringify(req.body);
    await this.service.handleWebhook(body, headers);
    return { received: true };
  }

  @Post('stub/succeed/:intentId')
  @Public()
  @Auditable({ action: 'payment.stub.succeed', resource: 'Payment' })
  async stubSucceed(@Param('intentId') intentId: string) {
    await this.service.stubSimulateSuccess(intentId);
    return { ok: true };
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }
}
