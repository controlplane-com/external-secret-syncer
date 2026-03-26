import { DopplerConfig } from 'src/config/syncConfig';
import { Provider } from './provider.interface';
import axios, { AxiosInstance } from 'axios';
import { jsonParse, yamlParse } from '../util/parse';

export interface DopplerResponse {
  name: string;
  value: {
    raw: string;
    computed: string;
    note: string;
    rawValueType: {
      type: string;
    };
    computedValueType: {
      type: string;
    };
  };
  success: boolean;
  messages?: string[];
}

type DopplerDownloadResponse = Record<string, string>;

export class DopplerProvider extends Provider<DopplerConfig> {
  client: AxiosInstance;
  constructor(name: string, config: DopplerConfig) {
    super(name, config);
    this.client = axios.create({
      baseURL: 'https://api.doppler.com/v3',
      headers: {
        Authorization: `bearer ${config.accessToken}`,
      },
    });
  }

  async getSecret(secret: string, parse?: string): Promise<string> {
    const [project, config, secretName] = this.parseSecretPath(secret);

    try {
      const resp = (
        await this.client.get<DopplerResponse>('/configs/config/secret', {
          params: {
            project,
            config,
            name: secretName,
          },
        })
      ).data;

      if (
        !resp?.value ||
        typeof resp.value.computed !== 'string' ||
        !resp.value.computedValueType?.type
      ) {
        throw new Error(
          `Doppler API returned an invalid response for secret ${secretName}`,
        );
      }

      const secretValue = resp.value.computed;

      if (parse) {
        if (resp.value.computedValueType.type === 'json') {
          return jsonParse(secretValue, parse);
        } else if (resp.value.computedValueType.type === 'yaml') {
          return yamlParse(secretValue, parse);
        } else {
          throw new Error(
            `Unsupported parse type: ${resp.value.computedValueType.type}`,
          );
        }
      }

      return secretValue;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data?.messages?.join(', ') as string) ||
          error.message;
        throw new Error(`Doppler API error: ${message}`);
      } else {
        // rethrow to preserve the original error stack
        throw error;
      }
    }
  }

  async getSecrets(path: string): Promise<Record<string, string>> {
    const [project, config] = this.parseProjectPath(path);

    try {
      const resp = (
        await this.client.get<DopplerDownloadResponse>(
          '/configs/config/secrets/download',
          {
            params: {
              project,
              config,
              format: 'json',
            },
          },
        )
      ).data;

      if (!resp || typeof resp !== 'object' || Array.isArray(resp)) {
        throw new Error('Doppler API returned no secrets');
      }

      return Object.fromEntries(
        Object.entries(resp).map(([name, value]) => {
          if (typeof value !== 'string') {
            throw new Error(
              `Doppler API returned an invalid value for secret ${name}`,
            );
          }

          return [name, value];
        }),
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data?.messages?.join(', ') as string) ||
          error.message;
        throw new Error(`Doppler API error: ${message}`);
      }

      throw error;
    }
  }

  private parseSecretPath(secret: string): [string, string, string] {
    const normalizedSecret = this.normalizePath(secret);
    const parts = normalizedSecret.split('/');

    if (parts.length !== 3) {
      throw new Error(
        `Invalid secret format. Expected "project/config/secretName", got "${secret}"`,
      );
    }

    return parts as [string, string, string];
  }

  private parseProjectPath(path: string): [string, string] {
    const normalizedPath = this.normalizePath(path);
    const parts = normalizedPath.split('/');

    if (parts.length !== 2) {
      throw new Error(
        `Invalid Doppler config format. Expected "project/config", got "${path}"`,
      );
    }

    return parts as [string, string];
  }

  private normalizePath(path: string): string {
    const normalizedPath = path.trim().replace(/^\/+|\/+$/g, '');

    if (!normalizedPath || normalizedPath.includes('//')) {
      throw new Error(`Invalid Doppler path: "${path}"`);
    }

    return normalizedPath;
  }
}
