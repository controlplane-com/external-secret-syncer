import { Provider } from './provider.interface';
import { GcpSecretManagerConfig } from 'src/config/syncConfig';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { jsonParse } from '../util/parse';

export class GcpSecretManagerProvider extends Provider<GcpSecretManagerConfig> {
  client: SecretManagerServiceClient;

  constructor(name: string, config: GcpSecretManagerConfig) {
    super(name, config);
    this.client = new SecretManagerServiceClient({
      projectId: config.projectId,
      ...(config.credentials && {
        credentials: {
          client_email: config.credentials.clientEmail,
          private_key: config.credentials.privateKey,
        },
      }),
    });
  }

  async getSecret(s: string, path?: string): Promise<string> {
    const name = s.startsWith('projects/')
      ? s
      : `projects/${this.config.projectId}/secrets/${s}/versions/latest`;

    const [response] = await this.client.accessSecretVersion({ name });
    const secretString = response.payload?.data?.toString();

    if (!secretString) {
      throw new Error("Secret doesn't have a string value");
    }

    if (path) {
      return jsonParse(secretString, path);
    }

    return secretString;
  }
}
