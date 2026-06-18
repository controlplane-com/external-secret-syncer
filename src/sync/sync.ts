import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DataService } from '../ds/ds';
import {
  isDictionarySecret,
  Secret,
  SYNC_CONIFG_KEY,
  SyncConfigType,
} from '../config/syncConfig';
import { CONFIG_KEY, ConfigType } from '../config/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  DictionarySecretResponse,
  DiscoveredCplnSecret,
  OpaqueSecretResponse,
  ProviderSecret,
  ProviderService,
} from 'src/provider/provider';
import { CplnSecret, Dict, Opaque, SecretData } from 'src/types/secret';
import { logger } from 'src/config/logging';
import { isEqual } from 'lodash';

const SOURCE_TAG = 'syncer.cpln.io/source';
const ERROR_TAG = 'syncer.cpln.io/lastError';
const DISCOVERED_TAG = 'syncer.cpln.io/discoveredBy';

@Injectable()
export class Sync implements OnModuleInit {
  constructor(
    private readonly dataService: DataService,
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
    // discoverAllSecrets fans out into many cpln secrets, so it takes a
    // dedicated path instead of the single-secret flow below.
    if (secret.discoverAllSecrets) {
      return this.syncDiscovered(secret);
    }

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
    if (cplnSecret && this.secretChangedType(configSecret, cplnSecret)) {
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
    if (isDictionarySecret(configSecret)) {
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

  // Discover every secret in the provider's project and upsert one cpln secret
  // per discovered secret. Each is opaque or dictionary based on its provider
  // `cpln-type` label (resolved in ProviderService.discoverSecrets).
  //
  // This only ever creates/updates: a cpln secret whose source GCP secret is
  // later deleted (or renamed/relabeled to a different name) is NOT pruned. The
  // global cleanup system was intentionally removed, so orphan removal is out of
  // scope; the DISCOVERED_TAG is retained as provenance so such secrets can be
  // identified and removed manually if needed.
  private async syncDiscovered(
    secret: Secret,
  ): Promise<{ data: SecretData; error: string | undefined }> {
    let discovered: DiscoveredCplnSecret[];
    try {
      discovered = await this.provider.discoverSecrets(secret);
    } catch (e) {
      logger.error(
        { err: e as Error },
        `Failed to discover secrets for ${secret.name} from provider ${secret.provider}`,
      );
      return { error: e.message as string, data: {} };
    }

    const errors: string[] = [];
    for (const d of discovered) {
      try {
        await this.upsertDiscoveredSecret(secret, d);
      } catch (e) {
        logger.error(
          { err: e as Error },
          `Failed to sync discovered secret ${d.name} (from ${d.gcpName})`,
        );
        errors.push(`${d.name}: ${e.message as string}`);
      }
    }

    logger.info(
      `Synced ${discovered.length - errors.length}/${discovered.length} discovered secret(s) for ${secret.name}`,
    );

    return { data: {}, error: errors.length ? errors.join('; ') : undefined };
  }

  private async upsertDiscoveredSecret(
    configSecret: Secret,
    d: DiscoveredCplnSecret,
  ): Promise<void> {
    let cplnSecret = await this.dataService.get<CplnSecret>(
      `/org/${this.config.CPLN_ORG}/secret/${d.name}/-reveal`,
    );

    // secret managed by a different ESS workload
    if (
      cplnSecret?.tags?.[SOURCE_TAG] &&
      cplnSecret.tags[SOURCE_TAG] !== this.config.CPLN_WORKLOAD
    ) {
      throw new Error(
        `Secret ${d.name} is managed by another ESS (${cplnSecret.tags[SOURCE_TAG]})`,
      );
    }

    // delete first if the type changed (opaque <-> dictionary)
    if (cplnSecret && cplnSecret.type !== d.type) {
      await this.dataService.delete(
        `/org/${this.config.CPLN_ORG}/secret/${cplnSecret.name}`,
      );
      cplnSecret = null;
    }

    const data: SecretData =
      d.type === 'opaque' ? { payload: d.payload } : d.data;

    // only write when the data, the error tag, or the provenance tag changed
    if (
      !isEqual(data, cplnSecret?.data) ||
      !isEqual('', cplnSecret?.tags?.[ERROR_TAG]) ||
      cplnSecret?.tags?.[DISCOVERED_TAG] !== configSecret.name
    ) {
      await this.dataService.put(
        `/org/${this.config.CPLN_ORG}/secret/${d.name}`,
        {
          name: d.name,
          kind: 'secret',
          type: d.type,
          data,
          tags: {
            ...cplnSecret?.tags,
            [SOURCE_TAG]: this.config.CPLN_WORKLOAD,
            [DISCOVERED_TAG]: configSecret.name,
            [ERROR_TAG]: '',
          },
        },
      );
    }
  }

  // true if the existing cpln secret's type no longer matches the config secret
  // type, requiring a delete-and-recreate (cpln cannot change a secret's type).
  private secretChangedType(
    configSecret: Secret,
    cplnSecret: CplnSecret | null,
  ): boolean {
    if (cplnSecret === null) return false;

    if (configSecret.opaque && cplnSecret.type !== 'opaque') {
      return true;
    }
    if (isDictionarySecret(configSecret) && cplnSecret.type !== 'dictionary') {
      return true;
    }

    return false;
  }
}
