import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { DataService } from './ds';
import { ConfigType, CONFIG_KEY } from 'src/config/config';

@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: (config: ConfigType) => ({
        baseURL: config.CPLN_ENDPOINT,
        timeout: 10_000,
        headers: {
          'User-Agent': config.CPLN_ORG + '/ess',
          Authorization: config.CPLN_TOKEN,
        },
      }),
      inject: [CONFIG_KEY],
    }),
  ],
  controllers: [],
  providers: [DataService],
  exports: [DataService],
})
export class DataServiceModule {}
