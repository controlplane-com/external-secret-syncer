import { forwardRef, Module } from '@nestjs/common';
import { DataServiceModule } from 'src/ds/ds.module';
import { Sync } from './sync';
import { ProviderModule } from 'src/provider/provider.module';

@Module({
  imports: [DataServiceModule, forwardRef(() => ProviderModule)],
  controllers: [],
  providers: [Sync],
  exports: [Sync],
})
export class SyncModule {}
