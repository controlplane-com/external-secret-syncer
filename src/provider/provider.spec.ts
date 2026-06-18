import { ProviderService } from './provider';
import { ProviderSecretValue } from './providers/provider.interface';
import { Secret, SyncConfigType } from 'src/config/syncConfig';

const discoverSecret: Secret = {
  name: 'gcp-discover',
  provider: 'gcp',
  discoverAllSecrets: true,
} as Secret;

// Builds a ProviderService with a single fake provider whose bulk getSecrets
// returns the given map, bypassing onModuleInit / real SDK clients.
function serviceWith(secrets: Record<string, ProviderSecretValue> | Error) {
  const service = new ProviderService({} as SyncConfigType);
  service.providers = [
    {
      name: 'gcp',
      getSecret: jest.fn(),
      getSecrets: jest.fn(() =>
        secrets instanceof Error
          ? Promise.reject(secrets)
          : Promise.resolve(secrets),
      ),
    } as any,
  ];
  return service;
}

describe('ProviderService.discoverSecrets', () => {
  it('maps opaque secrets to a payload', async () => {
    const service = serviceWith({ token: { value: 'abc', type: 'opaque' } });

    const result = await service.discoverSecrets(discoverSecret);

    expect(result).toEqual([
      { name: 'token', gcpName: 'token', type: 'opaque', payload: 'abc' },
    ]);
  });

  it('defaults to opaque when the provider omits a type', async () => {
    const service = serviceWith({ token: { value: 'abc' } });

    const result = await service.discoverSecrets(discoverSecret);

    expect(result).toEqual([
      { name: 'token', gcpName: 'token', type: 'opaque', payload: 'abc' },
    ]);
  });

  it('parses and flattens dictionary secrets', async () => {
    const service = serviceWith({
      config: {
        value: JSON.stringify({ db: { user: 'admin' }, port: 5432 }),
        type: 'dictionary',
      },
    });

    const result = await service.discoverSecrets(discoverSecret);

    expect(result).toEqual([
      {
        name: 'config',
        gcpName: 'config',
        type: 'dictionary',
        data: { 'db.user': 'admin', port: '5432' },
      },
    ]);
  });

  it('falls back to a __raw key when a dictionary value is not a JSON object', async () => {
    const service = serviceWith({
      config: { value: 'not-json', type: 'dictionary' },
    });

    const result = await service.discoverSecrets(discoverSecret);

    expect(result).toEqual([
      {
        name: 'config',
        gcpName: 'config',
        type: 'dictionary',
        data: { __raw: 'not-json' },
      },
    ]);
  });

  it('sanitizes provider names into valid cpln names', async () => {
    const service = serviceWith({ MY_API_KEY: { value: 'x', type: 'opaque' } });

    const result = await service.discoverSecrets(discoverSecret);

    expect(result[0].name).toBe('my-api-key');
    expect(result[0].gcpName).toBe('MY_API_KEY');
  });

  it('dedupes secrets whose sanitized names collide (last wins)', async () => {
    const service = serviceWith({
      MY_KEY: { value: 'first', type: 'opaque' },
      'my-key': { value: 'second', type: 'opaque' },
    });

    const result = await service.discoverSecrets(discoverSecret);

    expect(result).toEqual([
      { name: 'my-key', gcpName: 'my-key', type: 'opaque', payload: 'second' },
    ]);
  });
});

describe('ProviderService.checkSecret (discoverAllSecrets)', () => {
  it('reports OK with the resolved type per discovered secret', async () => {
    const service = serviceWith({
      token: { value: 'abc', type: 'opaque' },
      config: { value: '{"a":1}', type: 'dictionary' },
    });

    const result = await service.checkSecret(discoverSecret);

    expect(result).toEqual({
      name: 'gcp-discover',
      dictionary: {
        token: 'OK (opaque)',
        config: 'OK (dictionary)',
      },
    });
  });

  it('reports an error when discovery fails', async () => {
    const service = serviceWith(new Error('boom'));

    const result = await service.checkSecret(discoverSecret);

    expect(result).toEqual({
      name: 'gcp-discover',
      dictionary: { _discover: 'ERROR: boom' },
    });
  });
});
