import { forwardRef, Module } from '@nestjs/common';
import { ProviderController } from './provider.controller';
import { ProviderService } from './provider';
import { SyncModule } from 'src/sync/sync.module';

@Module({
  imports: [forwardRef(() => SyncModule)],
  controllers: [ProviderController],
  providers: [ProviderService],
  exports: [ProviderService],
})
export class ProviderModule {}
