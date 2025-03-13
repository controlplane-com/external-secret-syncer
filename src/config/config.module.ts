import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { SyncReloadService } from './reload';
import { ConfigController } from './config.controller';
import { Shortcuts } from './shortcuts';
import { CONFIG_KEY, config } from './config';
import { SYNC_CONIFG_KEY, syncConfig } from './syncConfig';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({ envFilePath: ['development.env'], cache: true }),
  ],
  controllers: [ConfigController],
  providers: [
    {
      provide: CONFIG_KEY,
      useFactory: config,
    },
    {
      provide: SYNC_CONIFG_KEY,
      useFactory: syncConfig,
    },
    SyncReloadService,
    Shortcuts,
  ],
  exports: [CONFIG_KEY, SYNC_CONIFG_KEY, SyncReloadService, Shortcuts],
})
export class ConfigModule {}
