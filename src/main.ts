import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import { DataServiceModule } from './ds/ds.module';
import { HttpModule } from '@nestjs/axios';
import { SyncReloadService } from './config/reload';
import { BunyanLogger } from './config/logging';
import { logger } from './config/logging';
import { ProviderModule } from './provider/provider.module';
import { CONFIG_KEY, ConfigType } from './config/config';
import { ConfigModule } from './config/config.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    CacheModule.register({ isGlobal: true }),
    DataServiceModule,
    ConfigModule,
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
      headers: {
        'User-Agent': process.env.ORG_NAME + '/ess',
      },
    }),
    ProviderModule,
    SyncModule,
  ],
  controllers: [],
  providers: [],
})
export class RootModule {}

async function bootstrap() {
  // loop for reload
  while (true) {
    const app = await NestFactory.create(RootModule, {
      logger: new BunyanLogger(),
    });
    const config = app.get<ConfigType>(CONFIG_KEY);

    const reloadService = app.get(SyncReloadService);
    reloadService.injectApp(app);

    const port = config.PORT;
    await app.listen(port, () => {
      logger.info(`Listening on port: ${port}`);
    });

    // reload app
    await reloadService.reload;

    logger.info('RELOADING...');
    await app.close();
  }
}
bootstrap();
