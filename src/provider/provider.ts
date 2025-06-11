import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Secret, SYNC_CONIFG_KEY, SyncConfigType } from 'src/config/syncConfig';
import { Provider } from './providers/provider.interface';
import { VaultProvider } from './providers/vault';
import { AwsSecretsManagerProvider } from './providers/awsSecretsManager';
import { logger } from 'src/config/logging';
import { AwsParameterStore } from './providers/awsParameterStore';

export interface SecretResponse {
  secret?: string;
  defaulted?: boolean;
  error?: string;
}
export type OpaqueSecretResponse = SecretResponse;
export type DictionarySecretResponse = Record<string, SecretResponse>;
export type ProviderSecret = OpaqueSecretResponse | DictionarySecretResponse;

export type CheckSecretResponse = {
  name: string;
} & ({ opaque: string } | { dictionary: Record<string, string> });

@Injectable()
export class ProviderService implements OnModuleInit {
  providers: Provider<any>[] = [];

  constructor(
    @Inject(SYNC_CONIFG_KEY) private readonly syncConfig: SyncConfigType,
  ) {}

  onModuleInit() {
    for (const provider of this.syncConfig.providers) {
      if (provider.vault) {
        this.providers.push(new VaultProvider(provider.name, provider.vault));
      }
      if (provider.awsSecretsManager) {
        this.providers.push(
          new AwsSecretsManagerProvider(
            provider.name,
            provider.awsSecretsManager,
          ),
        );
      }
      if (provider.awsParameterStore) {
        this.providers.push(
          new AwsParameterStore(provider.name, provider.awsParameterStore),
        );
      }
    }
  }

  async getSecret(secret: Secret): Promise<ProviderSecret> {
    const provider = this.getProviderForSecret<any>(secret);
    if (!provider) {
      throw new Error(`Provider ${secret.provider} not found`);
    }

    if (secret.opaque) {
      if (typeof secret.opaque === 'string') {
        try {
          const secretData = await provider.getSecret(secret.opaque);
          return { secret: secretData };
        } catch (e) {
          logger.error(
            { err: e as Error },
            `Error getting secret ${secret.opaque} from ${provider.name}`,
          );
          throw e; // do not have a fall back default
        }
      } else {
        // default/parse/encoding exists
        const path = secret.opaque.path;
        const parse = secret.opaque.parse;
        const encoding = secret.opaque.encoding;

        // base64 decode default value
        let defaultValue = secret.opaque.default;

        if (!path) {
          return { secret: defaultValue, defaulted: true };
        }

        try {
          // inside try catch to handle errors
          if (encoding === 'base64' && defaultValue) {
            defaultValue = this.base64Decode(defaultValue);
          }

          const secretDataRaw = await provider.getSecret(path, parse);
          let secretData = secretDataRaw;
          if (encoding == 'base64') {
            secretData = this.base64Decode(secretDataRaw);
          }
          return { secret: secretData };
        } catch (e) {
          logger.error(
            { err: e as Error },
            `Error getting secret ${path} from ${provider.name}`,
          );
          return {
            secret: defaultValue,
            defaulted: true,
            error: e.message as string,
          }; // include error message with default
        }
      }
    }

    if (secret.dictionary) {
      const data: Record<string, SecretResponse> = {};

      for (const [key, obj] of Object.entries(secret.dictionary)) {
        const path = typeof obj === 'string' ? obj : obj.path;
        const parse = typeof obj === 'string' ? undefined : obj.parse;
        const encoding = typeof obj === 'string' ? undefined : obj.encoding;

        let defaultValue = typeof obj === 'string' ? undefined : obj.default;

        // must have default
        if (!path) {
          data[key] = {
            secret: defaultValue,
            defaulted: true,
          };
          continue;
        }

        try {
          // inside try catch to handle errors
          if (encoding === 'base64' && defaultValue) {
            defaultValue = this.base64Decode(defaultValue);
          }

          let secretData = await provider.getSecret(path, parse);
          if (encoding === 'base64') {
            secretData = this.base64Decode(secretData);
          }

          data[key] = { secret: secretData };
        } catch (e) {
          logger.error(
            { err: e as Error },
            `Error getting secret ${path} from ${provider.name}`,
          );

          data[key] = {
            secret: defaultValue,
            defaulted: true,
            error: e.message as string,
          };
        }
      }

      return data;
    }

    // unexpected path
    throw new Error(`Unexpected error for: ${secret.name}`);
  }

  async checkSecret(secret: Secret): Promise<CheckSecretResponse> {
    let resolved: ProviderSecret;
    try {
      resolved = await this.getSecret(secret);
    } catch (e) {
      if (secret.opaque) {
        return {
          name: secret.name,
          opaque: 'ERROR: ' + e.message,
        };
      } else {
        return {
          name: secret.name,
          dictionary: Object.fromEntries(
            Object.keys(secret.dictionary!).map((key) => [
              key,
              'ERROR: ' + e.message,
            ]),
          ),
        };
      }
    }

    if (secret.opaque) {
      return {
        name: secret.name,
        opaque: resolved.error
          ? `ERROR: ${resolved.error as string}`
          : resolved.defaulted
            ? 'DEFAULT'
            : 'OK',
      };
    }

    if (secret.dictionary) {
      const res: Record<string, string> = {};
      for (const key of Object.keys(secret.dictionary)) {
        const resolvedPair = resolved[key] as SecretResponse;
        res[key] = resolvedPair.error
          ? `ERROR: ${resolvedPair.error}`
          : resolvedPair.defaulted
            ? 'DEFAULT'
            : 'OK';
      }

      return {
        name: secret.name,
        dictionary: res,
      };
    }

    throw new Error('Unexpected error for: ${secret.name}');
  }

  getProviderForSecret<T>(secret: Secret): Provider<T> {
    const provider = this.providers.find((p) => p.name === secret.provider);
    if (!provider) {
      throw new Error(`Provider ${provider} not found`);
    }

    return provider as Provider<T>;
  }

  base64Decode(value: string): string {
    try {
      return Buffer.from(value, 'base64').toString('utf-8');
    } catch (e) {
      logger.error(
        { err: e as Error },
        `Error decoding base64 value: ${value}`,
      );
      throw new Error(`Invalid base64 value: ${value}`);
    }
  }
}
