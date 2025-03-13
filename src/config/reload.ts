import { INestApplication, Inject, Injectable, Logger } from '@nestjs/common';
import { sleep } from 'src/util';
import { SyncConfigType, syncConfig } from './syncConfig';
import { isEqual } from 'lodash';

@Injectable()
export class SyncReloadService {
  app: INestApplication;
  reload: Promise<void>;

  constructor(
    @Inject('syncConfig') private readonly syncConfig: SyncConfigType,
  ) {
    this.reload = this.handle();
  }

  injectApp(app: INestApplication) {
    this.app = app;
  }

  // returns if the sync config changed
  async handle() {
    while (true) {
      await sleep(5 * 1000);
      const changed = await this.syncConfigChanged();
      if (changed) {
        Logger.log('Sync config changed, reloading...');
        return;
      }
    }
  }

  async syncConfigChanged() {
    try {
      const newConfig = await syncConfig();
      return !isEqual(this.syncConfig, newConfig);
    } catch (err) {
      Logger.error('Failed to check for sync config change', err);
      // fail silently
      return false;
    }
  }
}
