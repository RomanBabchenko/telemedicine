import { Global, Module } from '@nestjs/common';
import { LiveKitClientService } from './livekit-client.service';

@Global()
@Module({
  providers: [LiveKitClientService],
  exports: [LiveKitClientService],
})
export class LiveKitModule {}
