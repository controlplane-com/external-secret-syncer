import { Provider } from './provider.interface';
import { AwsParameterStoreConfig } from 'src/config/syncConfig';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { logger } from 'src/config/logging';
import { get } from 'lodash';
import { JSON } from 'src/types/json';

export interface AwsParameterStoreResponse {
  Parameter: {
    Name: string;
    Type: 'String' | 'StringList' | 'SecureString';
    Value: string;
    Version: number;
    LastModifiedDate: Date;
    ARN: string;
    DataType: string;
  };
}

export class AwsParameterStore extends Provider<AwsParameterStoreConfig> {
  client: SSMClient;

  constructor(name: string, config: AwsParameterStoreConfig) {
    super(name, config);
    this.client = new SSMClient({
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
    const command = new GetParameterCommand({ Name: s, WithDecryption: true });
    const response = await this.client.send(command);
    const secretString = response.Parameter?.Value;

    // should never get into this branch
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
