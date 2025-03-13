import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataService } from 'src/ds/ds';
import { CONFIG_KEY, ConfigType } from 'src/config/config';
import { CplnSecret } from 'src/types/secret';
import { Shortcuts } from 'src/config/shortcuts';
import { Secret, SYNC_CONIFG_KEY, SyncConfigType } from 'src/config/syncConfig';
import { logger } from 'src/config/logging';

@Injectable()
export class CleanupService {
  constructor(
    private ds: DataService,
    @Inject(CONFIG_KEY)
    private config: ConfigType,
    @Inject(SYNC_CONIFG_KEY)
    private readonly syncConfig: SyncConfigType,
    private sc: Shortcuts,
  ) {}

  async cleanupAllSecrets() {
    const cplnSecrets = await this.getCplnSecretsForThisEss();

    for (const secret of cplnSecrets) {
      logger.info({ secret }, `Deleting secret ${secret.name}...`);
      await this.ds.delete(
        `/org/${this.config.CPLN_ORG}/secret/${secret.name}`,
      );
    }
  }

  // deletes secerts that have been removed/renamed from the config
  @Interval(1000 * 60 * 60)
  async cleanupUnusedSecrets() {
    const cplnSecrets = await this.getCplnSecretsForThisEss();

    for (const secret of cplnSecrets) {
      const configSecret = this.syncConfig.secrets.find(
        (s) => s.name === secret.name,
      );
      if (!configSecret || this.secretChangedType(configSecret, secret)) {
        logger.info(
          { secret },
          `Found secret not referenced by config, deleting...`,
        );
        try {
          await this.ds.delete(
            `/org/${this.config.CPLN_ORG}/secret/${secret.name}`,
          );
        } catch (e) {
          logger.error({ secret, err: e as Error }, 'Error deleting secret');
        }
      }
    }
  }

  private async getCplnSecretsForThisEss() {
    return await this.ds.query<CplnSecret>(
      `/org/${this.config.CPLN_ORG}/secret`,
      {
        spec: {
          match: 'all',
          terms: [
            {
              op: '=',
              tag: 'syncer.cpln.io/source',
              value: this.sc.wokloadShortLink,
            },
          ],
        },
      },
    );
  }

  secretChangedType(configSecret: Secret, cplnSecret: CplnSecret | null) {
    if (cplnSecret === null) return false;

    if (configSecret.opaque && cplnSecret.type !== 'opaque') {
      return true;
    }
    if (configSecret.dictionary && cplnSecret.type !== 'dictionary') {
      return true;
    }

    return false;
  }
}
