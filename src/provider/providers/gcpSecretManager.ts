import { Provider, ProviderSecretValue } from './provider.interface';
import { GcpSecretManagerConfig } from 'src/config/syncConfig';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { jsonParse } from '../util/parse';

const CPLN_TYPE_LABEL = 'cpln-type';

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

  async getSecrets(): Promise<Record<string, ProviderSecretValue>> {
    const parent = `projects/${this.config.projectId}`;
    const [secrets] = await this.client.listSecrets({ parent });

    const entries = await Promise.all(
      secrets.map(async (secret) => {
        if (!secret.name) return null;
        const shortName = secret.name.split('/').pop();
        if (!shortName) return null;

        const value = await this.accessLatest(secret.name);
        if (value === null) return null;

        // The `cpln-type` label decides how the secret is materialized in CPLN
        // by the discoverAllSecrets flow. "dictionary" → parse + flatten the
        // JSON value into a dictionary secret; anything else (or unset) → plain
        // opaque secret.
        const type =
          secret.labels?.[CPLN_TYPE_LABEL] === 'dictionary'
            ? 'dictionary'
            : 'opaque';

        return [shortName, { value, type }] as [string, ProviderSecretValue];
      }),
    );

    return Object.fromEntries(
      entries.filter((e): e is [string, ProviderSecretValue] => e !== null),
    );
  }

  // Accesses the latest enabled version of a secret, returning null when there
  // is no accessible value (no versions, disabled, destroyed, or empty payload).
  private async accessLatest(secretName: string): Promise<string | null> {
    try {
      const [version] = await this.client.accessSecretVersion({
        name: `${secretName}/versions/latest`,
      });
      const value = version.payload?.data?.toString();
      return value === undefined || value === null ? null : value;
    } catch (e: any) {
      // skip secrets with no accessible latest version (no versions, disabled, destroyed)
      if (e?.code === 5 || e?.code === 9) return null;
      throw e;
    }
  }
}
