import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DataService } from '../ds/ds';
import { Secret, SYNC_CONIFG_KEY, SyncConfigType } from '../config/syncConfig';
import { CONFIG_KEY, ConfigType } from '../config/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  DictionarySecretResponse,
  OpaqueSecretResponse,
  ProviderSecret,
  ProviderService,
} from 'src/provider/provider';
import { CplnSecret, Dict, Opaque, SecretData } from 'src/types/secret';
import { CleanupService } from './cleanup';
import { logger } from 'src/config/logging';
import { isEqual } from 'lodash';

const SOURCE_TAG = 'syncer.cpln.io/source';
const ERROR_TAG = 'syncer.cpln.io/lastError';

@Injectable()
export class Sync implements OnModuleInit {
  constructor(
    private readonly dataService: DataService,
    private readonly cleanupService: CleanupService,
    @Inject(SYNC_CONIFG_KEY)
    private readonly syncConfig: SyncConfigType,
    @Inject(CONFIG_KEY)
    private readonly config: ConfigType,
    private readonly provider: ProviderService,
    private schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    this.syncConfig.secrets.forEach((secret) => {
      const provider = this.syncConfig.providers.find(
        (p) => p.name === secret.provider,
      );
      const interval =
        secret.syncInterval ??
        provider?.syncInterval ??
        this.config.DEFAULT_SYNC_INTERVAL;

      const syncInterval = setInterval(() => {
        this.sync(secret).catch((e) => {
          logger.error(
            { err: e as Error },
            `Failed to sync secret ${secret.name}`,
          );
        });
      }, interval);
      this.schedulerRegistry.addInterval(secret.name, syncInterval);
      logger.info(`Scheduled sync for secret ${secret.name}`);
    });
  }

  async sync(
    secret: Secret,
  ): Promise<{ data: SecretData; error: string | undefined }> {
    // getting cpln secret
    const cplnSecret = await this.dataService.get<CplnSecret>(
      `/org/${this.config.CPLN_ORG}/secret/${secret.name}/-reveal`,
    );

    // secret managed by different ess
    if (
      cplnSecret &&
      cplnSecret.tags?.[SOURCE_TAG] &&
      cplnSecret.tags[SOURCE_TAG] !== this.config.CPLN_WORKLOAD
    ) {
      throw new Error(
        `Secret ${secret.name} is managed by another ESS (${cplnSecret.tags[SOURCE_TAG]})`,
      );
    }

    // generating secret from provider
    try {
      const providerSecret = await this.provider.getSecret(secret);
      return await this.verifyCplnSecret(secret, cplnSecret, providerSecret);
    } catch (e) {
      logger.error(
        { err: e as Error },
        `Failed to get secret ${secret.name} from provider ${secret.provider} and no default value provided`,
      );
      // update error tag
      await this.dataService.put(
        `/org/${this.config.CPLN_ORG}/secret/${secret.name}`,
        {
          name: secret.name,
          kind: 'secret',
          type: secret.opaque ? 'opaque' : 'dictionary',
          data: (cplnSecret?.data ?? secret.opaque) ? { payload: 'error' } : {},
          tags: {
            ...cplnSecret?.tags,
            [SOURCE_TAG]: this.config.CPLN_WORKLOAD,
            [ERROR_TAG]: e.message as string,
          },
        },
      );

      return { error: e.message as string, data: {} };
    }
  }

  private async verifyCplnSecret(
    configSecret: Secret,
    cplnSecret: CplnSecret | null,
    providerSecret: ProviderSecret,
  ) {
    let error: string | undefined = undefined;
    let data: Dict | Opaque;

    // delete secret first if it has different type
    if (
      cplnSecret &&
      this.cleanupService.secretChangedType(configSecret, cplnSecret)
    ) {
      await this.dataService.delete(
        `/org/${this.config.CPLN_ORG}/secret/${cplnSecret.name}`,
      );
      cplnSecret = null;
    }

    // populating for opaque secret
    if (configSecret.opaque) {
      data = {
        payload:
          (providerSecret as OpaqueSecretResponse).secret ??
          cplnSecret?.data?.payload,
      };
      error = (providerSecret as OpaqueSecretResponse).error;

      // check for recently defaulted secret
      if (
        providerSecret.defaulted &&
        error &&
        cplnSecret?.data?.payload &&
        data.payload !== cplnSecret.data.payload
      ) {
        data = cplnSecret.data;
      }
    }

    // populating for dictionary secret
    if (configSecret.dictionary) {
      data = {};
      for (const [key, obj] of Object.entries(
        providerSecret as DictionarySecretResponse,
      )) {
        data[key] = obj.secret ?? (cplnSecret?.data as Dict | undefined)?.[key];
        if (obj.error) {
          error = obj.error;
        }

        // reset if default used
        if (
          obj.defaulted &&
          obj.error &&
          cplnSecret?.data[key] &&
          obj.secret !== cplnSecret.data[key]
        ) {
          data[key] = (cplnSecret.data as Dict)[key];
        }
      }
    }

    // update secret if data or error changed
    if (
      !isEqual(data!, cplnSecret?.data) ||
      !isEqual(error ?? '', cplnSecret?.tags?.[ERROR_TAG])
    ) {
      await this.dataService.put(
        `/org/${this.config.CPLN_ORG}/secret/${configSecret.name}`,
        {
          name: configSecret.name,
          kind: 'secret',
          type: configSecret.opaque ? 'opaque' : 'dictionary',
          data: data!,
          tags: {
            ...cplnSecret?.tags,
            [SOURCE_TAG]: this.config.CPLN_WORKLOAD,
            [ERROR_TAG]: error ?? '',
          },
        },
      );
    }

    return { data: data!, error };
  }
}
