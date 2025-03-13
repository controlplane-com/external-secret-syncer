import {
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Param,
  Post,
} from '@nestjs/common';
import {
  removeSensitive,
  SYNC_CONIFG_KEY,
  SyncConfigType,
} from 'src/config/syncConfig';
import { CheckSecretResponse, ProviderService } from './provider';
import { Sync } from 'src/sync/sync';

@Controller('provider')
export class ProviderController {
  constructor(
    @Inject(SYNC_CONIFG_KEY) private readonly syncConfig: SyncConfigType,
    private sync: Sync,
    private provider: ProviderService,
  ) {}

  @Get()
  getProviders() {
    return removeSensitive(this.syncConfig).providers;
  }

  @Post(':name/-check')
  async checkProvider(@Param('name') name: string) {
    const secretsForProvider = this.syncConfig.secrets.filter(
      (s) => s.provider === name,
    );

    const secrets: CheckSecretResponse[] = [];
    for (const secret of secretsForProvider) {
      secrets.push(await this.provider.checkSecret(secret));
    }

    return { secrets };
  }

  @Post(':name/-sync')
  async syncProvider(@Param('name') name: string) {
    const secretsForProvider = this.syncConfig.secrets.filter(
      (s) => s.provider === name,
    );

    for (const secret of secretsForProvider) {
      const res = await this.sync.sync(secret);
      if (res.error) {
        throw new InternalServerErrorException(res.error);
      }
    }

    return;
  }
}
