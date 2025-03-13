import { forwardRef, Module } from '@nestjs/common';
import { DataServiceModule } from 'src/ds/ds.module';
import { CleanupService } from './cleanup';
import { Sync } from './sync';
import { ProviderModule } from 'src/provider/provider.module';

@Module({
  imports: [DataServiceModule, forwardRef(() => ProviderModule)],
  controllers: [],
  providers: [CleanupService, Sync],
  exports: [Sync],
})
export class SyncModule {}
