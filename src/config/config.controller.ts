import { Controller, Get, Inject } from '@nestjs/common';
import { removeSensitive, SyncConfigType } from './syncConfig';

@Controller()
export class ConfigController {
  constructor(
    @Inject('syncConfig') private readonly syncConfig: SyncConfigType,
  ) {}

  @Get('about')
  about() {
    return {
      alive: true,
    };
  }

  @Get('config')
  config() {
    return removeSensitive(this.syncConfig);
  }
}
