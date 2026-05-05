import { OnePasswordConnect, OPConnect } from '@1password/connect';
import { Provider } from './provider.interface';
import { OnePasswordConnectConfig } from 'src/config/syncConfig';

export class OnePasswordConnectProvider extends Provider<OnePasswordConnectConfig> {
  client?: OPConnect;

  constructor(name: string, config: OnePasswordConnectConfig) {
    super(name, config);
    this.client = OnePasswordConnect({
      serverURL: config.serverURL,
      token: config.token,
      keepAlive: true,
    });
  }

  async getSecret(s: string): Promise<string> {
    if (!this.client) {
      throw new Error('OnePasswordConnect client is not initialized');
    }

    const parts = s.split('/');
    if (parts.length < 3) {
      throw new Error(
        `Invalid secret path "${s}": expected format vault/item/field`,
      );
    }

    const [vaultRef, itemRef, ...fieldParts] = parts;
    const fieldLabel = fieldParts.join('/');

    try {
      const vault = await this.client.getVault(vaultRef);
      if (!vault.id) {
        throw new Error(`Vault "${vaultRef}" returned no ID`);
      }

      const item = await this.client.getItem(vault.id, itemRef);
      const field = item.fields?.find(
        (f) => f.label === fieldLabel || f.id === fieldLabel,
      );

      if (!field) {
        throw new Error(`not found: field "${fieldLabel}"`);
      }

      return field.value ?? '';
    } catch (error) {
      if (
        error.message.includes('not found') ||
        error.message.includes('404')
      ) {
        throw new Error(`Item "${s}" not found in OnePasswordConnect`);
      }
      throw new Error(
        `Error retrieving secret ("${s}") from OnePasswordConnect: ${error.message}`,
      );
    }
  }
}
