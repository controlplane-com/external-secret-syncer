import { Client, createClient } from '@1password/sdk';
import { Provider } from './provider.interface';
import { OnePasswordConfig } from 'src/config/syncConfig';

export class OnePasswordProvider extends Provider<OnePasswordConfig> {
  client?: Client;

  constructor(name: string, config: OnePasswordConfig) {
    super(name, config);
    this.init(config).catch((error) => {
      console.error(
        `Failed to initialize OnePasswordProvider: ${error.message}`,
      );
    });
  }

  async init(config: OnePasswordConfig): Promise<void> {
    this.client = await createClient({
      auth: config.serviceAccountToken,
      integrationName: config.integrationName,
      integrationVersion: config.integrationVersion,
    });
  }

  async getSecret(s: string): Promise<string> {
    if (!this.client) {
      throw new Error('OnePassword client is not initialized');
    }

    const secretReference = `op:/${s}`;

    try {
      const item = await this.client.secrets.resolve(secretReference);
      return item;
    } catch (error) {
      if (error.message.includes('no item')) {
        throw new Error(`Item ${secretReference} not found in OnePassword`);
      } else {
        throw new Error(
          `Error retrieving secret (${secretReference}) from OnePassword: ${error.message}`,
        );
      }
    }
  }
}
