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
    if (secret.startsWith('/')) {
      secret = secret.slice(1); // Remove leading slash if present
    }

    const [project, config, secretName] = secret.split('/'); // Assuming secret is in the format "project/config/secretName"

    if (!project || !config || !secretName) {
      throw new Error(
        `Invalid secret format. Expected "project/config/secretName", got "${secret}"`,
      );
    }
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
}
