import { InfisicalConfig } from 'src/config/syncConfig';
import { Provider, ProviderSecretValue } from './provider.interface';
import { InfisicalSDK } from '@infisical/sdk';
import { jsonParse, yamlParse } from '../util/parse';

export class InfisicalProvider extends Provider<InfisicalConfig> {
  private client: InfisicalSDK;
  private authenticated = false;
  private tokenExpiresAt = 0;

  constructor(name: string, config: InfisicalConfig) {
    super(name, config);
    this.client = new InfisicalSDK(
      config.siteUrl ? { siteUrl: config.siteUrl } : undefined,
    );
  }

  async getSecret(secret: string, parse?: string): Promise<string> {
    const { environment, secretPath, secretName } =
      this.parseSecretPath(secret);
    await this.authenticate();

    try {
      const result = await this.client.secrets().getSecret({
        projectId: this.config.projectId,
        environment,
        secretName,
        secretPath,
        viewSecretValue: true,
      });

      const value = result?.secretValue;
      if (typeof value !== 'string') {
        throw new Error(
          `Infisical API returned an invalid response for secret ${secretName}`,
        );
      }

      if (parse) {
        return this.parseValue(value, parse);
      }

      return value;
    } catch (error) {
      throw this.toError(error, `retrieving secret "${secret}"`);
    }
  }

  async getSecrets(path: string): Promise<Record<string, ProviderSecretValue>> {
    const { environment, secretPath } = this.parseProjectPath(path);
    await this.authenticate();

    try {
      const result = await this.client.secrets().listSecrets({
        projectId: this.config.projectId,
        environment,
        secretPath,
        viewSecretValue: true,
      });

      if (!result || !Array.isArray(result.secrets)) {
        throw new Error('Infisical API returned no secrets');
      }

      return Object.fromEntries(
        result.secrets.map((s) => {
          if (typeof s.secretValue !== 'string') {
            throw new Error(
              `Infisical API returned an invalid value for secret ${s.secretKey}`,
            );
          }

          return [s.secretKey, { value: s.secretValue }];
        }),
      );
    } catch (error) {
      throw this.toError(error, `listing secrets for "${path}"`);
    }
  }

  private async authenticate(): Promise<void> {
    if (this.authenticated && Date.now() < this.tokenExpiresAt) {
      return;
    }

    try {
      await this.client.auth().universalAuth.login({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
      });
      this.authenticated = true;
      // SDK does not auto-renew; re-login after ~50 min to stay ahead of TTL
      this.tokenExpiresAt = Date.now() + 50 * 60 * 1000;
    } catch (error) {
      this.authenticated = false;
      throw this.toError(error, 'authentication failed');
    }
  }

  private parseValue(value: string, parse: string): string {
    try {
      return jsonParse(value, parse);
    } catch {
      return yamlParse(value, parse);
    }
  }

  private parseSecretPath(secret: string): {
    environment: string;
    secretPath: string;
    secretName: string;
  } {
    const parts = this.normalizePath(secret).split('/');

    if (parts.length < 2) {
      throw new Error(
        `Invalid secret format. Expected "environment/[folder/...]/secretName", got "${secret}"`,
      );
    }

    const [environment, ...rest] = parts;
    const secretName = rest.pop() as string;
    const secretPath = rest.length ? `/${rest.join('/')}` : '/';

    return { environment, secretPath, secretName };
  }

  private parseProjectPath(path: string): {
    environment: string;
    secretPath: string;
  } {
    const parts = this.normalizePath(path).split('/');
    const [environment, ...rest] = parts;
    const secretPath = rest.length ? `/${rest.join('/')}` : '/';

    return { environment, secretPath };
  }

  private normalizePath(path: string): string {
    const normalizedPath = path.trim().replace(/^\/+|\/+$/g, '');

    if (!normalizedPath || normalizedPath.includes('//')) {
      throw new Error(`Invalid Infisical path: "${path}"`);
    }

    return normalizedPath;
  }

  private toError(error: unknown, context: string): Error {
    if (error instanceof Error) {
      return new Error(`Infisical error (${context}): ${error.message}`);
    }

    return new Error(`Infisical error (${context}): ${String(error)}`);
  }
}
