import { Provider } from './provider.interface';
import { AwsSecretsManagerConfig } from 'src/config/syncConfig';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { jsonParse } from '../util/parse';

export interface AwsSecretsManagerResponse {
  Name: string;
  ARN: string;
  VersionId: string;
  SecretString: string;
}

export class AwsSecretsManagerProvider extends Provider<AwsSecretsManagerConfig> {
  client: SecretsManagerClient;

  constructor(name: string, config: AwsSecretsManagerConfig) {
    super(name, config);
    this.client = new SecretsManagerClient({
      region: config.region,
      endpoint: config.endpoint,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            }
          : undefined,
    });
  }

  async getSecret(s: string, path?: string): Promise<string> {
    const command = new GetSecretValueCommand({ SecretId: s });
    const response = await this.client.send(command);
    const secretString = response.SecretString;

    if (!secretString) {
      throw new Error("Secret doesn't have a string value");
    }

    if (path) {
      return jsonParse(secretString, path);
    }

    return secretString;
  }
}
