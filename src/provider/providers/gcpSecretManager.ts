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

  async getSecrets(): Promise<Record<string, string>> {
    const parent = `projects/${this.config.projectId}`;
    const [secrets] = await this.client.listSecrets({ parent });

    const entries = await Promise.all(
      secrets.map(async (secret) => {
        if (!secret.name) return null;
        const shortName = secret.name.split('/').pop();
        if (!shortName) return null;

        try {
          const [version] = await this.client.accessSecretVersion({
            name: `${secret.name}/versions/latest`,
          });
          const value = version.payload?.data?.toString();
          if (value === undefined || value === null) return null;
          return [shortName, value] as [string, string];
        } catch (e: any) {
          // skip secrets with no accessible latest version (no versions, disabled, destroyed)
          if (e?.code === 5 || e?.code === 9) return null;
          throw e;
        }
      }),
    );

    return Object.fromEntries(
      entries.filter((e): e is [string, string] => e !== null),
    );
  }
}
