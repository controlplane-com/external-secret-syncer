import { Provider } from './provider.interface';
import { VaultConfig } from 'src/config/syncConfig';
import axios, { AxiosInstance } from 'axios';
import { get } from 'lodash';

type VaultSecretData = {
  [key: string]: string | VaultSecretData;
};

export interface VaultResponse {
  request_id: string;
  data: {
    data: VaultSecretData;
    metadata: {
      created_time: string;
      deletion_time: string;
      destroyed: boolean;
      version: number;
    };
  };
}

export class VaultProvider extends Provider<VaultConfig> {
  readonly address: string;
  readonly token: string;
  readonly client: AxiosInstance;

  constructor(name: string, config: VaultConfig) {
    super(name, config);
    this.address = config.address;
    this.token = config.token;
    this.client = axios.create({
      baseURL: this.address,
      headers: {
        'X-Vault-Token': this.token,
      },
    });
  }

  async getSecret(secret: string, path?: string): Promise<string> {
    const response = await this.client.get<VaultResponse>(`${secret}`);
    const secretObj = response.data.data;

    if (path) {
      const data = get(secretObj, path, undefined);
      if (!data) {
        throw new Error(`path ${path} did not lead to a valid value`);
      }

      if (typeof data === 'object') {
        return JSON.stringify(data);
      }

      return String(data);
    } else {
      return JSON.stringify(secretObj);
    }
  }
}
