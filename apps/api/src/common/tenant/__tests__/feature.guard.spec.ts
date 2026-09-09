import { Controller, ExecutionContext, ForbiddenException, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequireFeature } from '../decorators';
import { FeatureGuard } from '../feature.guard';

// Class-level + handler-level requirements must be merged, not overridden:
// the MIS recording endpoints need both misSync and audioArchive.
@Controller('x')
@RequireFeature('misSync')
class FakeController {
  @Get('plain')
  plain(): void {}

  @Get('recording')
  @RequireFeature('audioArchive')
  recording(): void {}
}

const ctx = (handler: (...args: never[]) => unknown): ExecutionContext =>
  ({
    getHandler: () => handler,
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => ({ params: {} }) }),
  }) as unknown as ExecutionContext;

const build = (features: Record<string, boolean>) => {
  const tenants = {
    getOrThrow: jest.fn().mockResolvedValue({ id: 't-1', featureMatrix: features }),
    hasFeature: (t: { featureMatrix: Record<string, boolean> }, f: string) =>
      t.featureMatrix[f] === true,
  };
  return new FeatureGuard(new Reflector(), tenants as never, {
    getTenantId: () => 't-1',
  } as never);
};

describe('FeatureGuard — merged class + handler requirements', () => {
  const proto = FakeController.prototype;

  it('handler without its own requirement needs only the class-level module', async () => {
    await expect(build({ misSync: true }).canActivate(ctx(proto.plain))).resolves.toBe(true);
  });

  it('handler with an extra requirement needs both modules', async () => {
    await expect(
      build({ misSync: true, audioArchive: true }).canActivate(ctx(proto.recording)),
    ).resolves.toBe(true);
  });

  it('rejects when the handler-level module is off even though the class-level one is on', async () => {
    await expect(
      build({ misSync: true, audioArchive: false }).canActivate(ctx(proto.recording)),
    ).rejects.toMatchObject({ response: { code: 'FEATURE_DISABLED' } });
  });

  it('rejects when the class-level module is off even though the handler-level one is on', async () => {
    await expect(
      build({ misSync: false, audioArchive: true }).canActivate(ctx(proto.recording)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
