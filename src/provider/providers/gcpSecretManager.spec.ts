import { GcpSecretManagerProvider } from './gcpSecretManager';
import { GcpSecretManagerConfig } from 'src/config/syncConfig';

// --- Mock the GCP SDK ------------------------------------------------------
const listSecrets = jest.fn();
const accessSecretVersion = jest.fn();

jest.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: jest.fn().mockImplementation(() => ({
    listSecrets,
    accessSecretVersion,
  })),
}));

const config: GcpSecretManagerConfig = { projectId: 'my-project' };

const secretResource = (
  shortName: string,
  labels?: Record<string, string>,
) => ({
  name: `projects/my-project/secrets/${shortName}`,
  ...(labels ? { labels } : {}),
});

const version = (value: string) => [{ payload: { data: Buffer.from(value) } }];

describe('GcpSecretManagerProvider', () => {
  let provider: GcpSecretManagerProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new GcpSecretManagerProvider('my-gcp', config);
  });

  describe('getSecrets', () => {
    it('defaults to opaque when the cpln-type label is absent', async () => {
      listSecrets.mockResolvedValue([[secretResource('PLAIN')]]);
      accessSecretVersion.mockResolvedValue(version('hello'));

      const result = await provider.getSecrets();

      expect(result).toEqual({
        PLAIN: { value: 'hello', type: 'opaque' },
      });
    });

    it('marks a secret dictionary when cpln-type=dictionary', async () => {
      listSecrets.mockResolvedValue([
        [secretResource('CONFIG', { 'cpln-type': 'dictionary' })],
      ]);
      accessSecretVersion.mockResolvedValue(version('{"a":1}'));

      const result = await provider.getSecrets();

      expect(result).toEqual({
        CONFIG: { value: '{"a":1}', type: 'dictionary' },
      });
    });

    it('treats cpln-type=opaque (and other values) as opaque', async () => {
      listSecrets.mockResolvedValue([
        [
          secretResource('A', { 'cpln-type': 'opaque' }),
          secretResource('B', { 'cpln-type': 'something-else' }),
        ],
      ]);
      accessSecretVersion.mockResolvedValue(version('v'));

      const result = await provider.getSecrets();

      expect(result.A.type).toBe('opaque');
      expect(result.B.type).toBe('opaque');
    });

    it('skips secrets with no accessible latest version', async () => {
      listSecrets.mockResolvedValue([
        [secretResource('OK'), secretResource('GONE')],
      ]);
      accessSecretVersion.mockImplementation(({ name }: { name: string }) => {
        if (name.includes('GONE')) {
          return Promise.reject({ code: 5 }); // NOT_FOUND
        }
        return Promise.resolve(version('live'));
      });

      const result = await provider.getSecrets();

      expect(result).toEqual({ OK: { value: 'live', type: 'opaque' } });
    });

    it('propagates unexpected access errors', async () => {
      listSecrets.mockResolvedValue([[secretResource('BOOM')]]);
      accessSecretVersion.mockRejectedValue({ code: 13, message: 'internal' });

      await expect(provider.getSecrets()).rejects.toMatchObject({
        code: 13,
      });
    });
  });
});
