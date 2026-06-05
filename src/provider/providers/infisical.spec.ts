import { InfisicalProvider } from './infisical';
import { InfisicalConfig } from 'src/config/syncConfig';

// --- Mock the official SDK -------------------------------------------------
const getSecret = jest.fn();
const listSecrets = jest.fn();
const login = jest.fn();

const secrets = jest.fn(() => ({ getSecret, listSecrets }));
const auth = jest.fn(() => ({ universalAuth: { login } }));

jest.mock('@infisical/sdk', () => ({
  InfisicalSDK: jest.fn().mockImplementation(() => ({ secrets, auth })),
}));

const config: InfisicalConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  projectId: 'project-id',
};

describe('InfisicalProvider', () => {
  let provider: InfisicalProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    login.mockResolvedValue(undefined);
    provider = new InfisicalProvider('my-infisical', config);
  });

  describe('getSecret', () => {
    it('authenticates and fetches a secret at the environment root', async () => {
      getSecret.mockResolvedValue({ secretKey: 'API_KEY', secretValue: 'abc' });

      const value = await provider.getSecret('dev/API_KEY');

      expect(value).toBe('abc');
      expect(login).toHaveBeenCalledWith({
        clientId: 'client-id',
        clientSecret: 'client-secret',
      });
      expect(getSecret).toHaveBeenCalledWith({
        projectId: 'project-id',
        environment: 'dev',
        secretName: 'API_KEY',
        secretPath: '/',
        viewSecretValue: true,
      });
    });

    it('resolves nested folders into secretPath', async () => {
      getSecret.mockResolvedValue({ secretKey: 'TOKEN', secretValue: 'xyz' });

      await provider.getSecret('prod/services/billing/TOKEN');

      expect(getSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'prod',
          secretPath: '/services/billing',
          secretName: 'TOKEN',
        }),
      );
    });

    it('extracts a value with the parse option (JSON)', async () => {
      getSecret.mockResolvedValue({
        secretKey: 'DB',
        secretValue: JSON.stringify({ port: 5432 }),
      });

      const value = await provider.getSecret('dev/DB', 'port');

      expect(value).toBe('5432');
    });

    it('caches the access token across calls', async () => {
      getSecret.mockResolvedValue({ secretKey: 'A', secretValue: '1' });

      await provider.getSecret('dev/A');
      await provider.getSecret('dev/A');

      expect(login).toHaveBeenCalledTimes(1);
    });

    it('rejects an invalid secret path', async () => {
      await expect(provider.getSecret('no-environment')).rejects.toThrow(
        /Invalid secret format/,
      );
    });

    it('wraps SDK errors with context', async () => {
      getSecret.mockRejectedValue(new Error('not found'));

      await expect(provider.getSecret('dev/MISSING')).rejects.toThrow(
        /Infisical error \(retrieving secret "dev\/MISSING"\): not found/,
      );
    });
  });

  describe('getSecrets', () => {
    it('lists all secrets in an environment', async () => {
      listSecrets.mockResolvedValue({
        secrets: [
          { secretKey: 'A', secretValue: '1' },
          { secretKey: 'B', secretValue: '2' },
        ],
      });

      const result = await provider.getSecrets('dev');

      expect(result).toEqual({ A: '1', B: '2' });
      expect(listSecrets).toHaveBeenCalledWith({
        projectId: 'project-id',
        environment: 'dev',
        secretPath: '/',
        viewSecretValue: true,
      });
    });

    it('supports a folder path', async () => {
      listSecrets.mockResolvedValue({ secrets: [] });

      await provider.getSecrets('dev/app');

      expect(listSecrets).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'dev', secretPath: '/app' }),
      );
    });
  });
});
