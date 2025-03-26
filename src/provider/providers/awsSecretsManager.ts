import { Provider } from './provider.interface';
import { AwsSecretsManagerConfig } from 'src/config/syncConfig';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { JSON } from 'src/types/json';
import { get } from 'lodash';
import { logger } from 'src/config/logging';

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
      try {
        const secretObj = JSON.parse(secretString) as JSON;
        const data = get(secretObj, path, undefined);

        if (!data) {
          throw new Error(`path ${path} did not lead to a valid value`);
        }

        if (typeof data === 'object') {
          return JSON.stringify(data);
        }

        return String(data);
      } catch (e) {
        logger.error(
          { err: e as Error },
          `Error parsing secret ${s} from ${this.name}`,
        );
        throw new Error('Secret is not a valid JSON object');
      }
    }

    return secretString;
  }
}
