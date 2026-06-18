import { Sync } from './sync';
import { DataService } from '../ds/ds';
import { ProviderService } from 'src/provider/provider';
import { ConfigType } from 'src/config/config';
import { Secret, SyncConfigType } from 'src/config/syncConfig';
import { SchedulerRegistry } from '@nestjs/schedule';

const SOURCE_TAG = 'syncer.cpln.io/source';
const ERROR_TAG = 'syncer.cpln.io/lastError';
const DISCOVERED_TAG = 'syncer.cpln.io/discoveredBy';

const WORKLOAD = 'my-workload';
const ORG = 'my-org';

const discoverSecret: Secret = {
  name: 'gcp-discover',
  provider: 'gcp',
  discoverAllSecrets: true,
} as Secret;

const secretPath = (name: string) => `/org/${ORG}/secret/${name}`;
const revealPath = (name: string) => `${secretPath(name)}/-reveal`;

type Mocks = {
  ds: { get: jest.Mock; put: jest.Mock; delete: jest.Mock };
  provider: { discoverSecrets: jest.Mock };
};

function buildSync(): { sync: Sync } & Mocks {
  const ds = { get: jest.fn(), put: jest.fn(), delete: jest.fn() };
  const provider = { discoverSecrets: jest.fn() };

  const sync = new Sync(
    ds as unknown as DataService,
    { secrets: [], providers: [] } as unknown as SyncConfigType,
    { CPLN_ORG: ORG, CPLN_WORKLOAD: WORKLOAD } as unknown as ConfigType,
    provider as unknown as ProviderService,
    {} as unknown as SchedulerRegistry,
  );

  return { sync, ds, provider };
}

describe('Sync.sync (discoverAllSecrets)', () => {
  it('creates one opaque and one dictionary cpln secret with provenance tags', async () => {
    const { sync, ds, provider } = buildSync();
    provider.discoverSecrets.mockResolvedValue([
      { name: 'token', gcpName: 'token', type: 'opaque', payload: 'abc' },
      { name: 'config', gcpName: 'config', type: 'dictionary', data: { a: '1' } },
    ]);
    ds.get.mockResolvedValue(null);
    ds.put.mockResolvedValue({});

    const result = await sync.sync(discoverSecret);

    expect(result).toEqual({ data: {}, error: undefined });
    expect(ds.put).toHaveBeenCalledTimes(2);
    expect(ds.put).toHaveBeenCalledWith(secretPath('token'), {
      name: 'token',
      kind: 'secret',
      type: 'opaque',
      data: { payload: 'abc' },
      tags: {
        [SOURCE_TAG]: WORKLOAD,
        [DISCOVERED_TAG]: 'gcp-discover',
        [ERROR_TAG]: '',
      },
    });
    expect(ds.put).toHaveBeenCalledWith(secretPath('config'), {
      name: 'config',
      kind: 'secret',
      type: 'dictionary',
      data: { a: '1' },
      tags: {
        [SOURCE_TAG]: WORKLOAD,
        [DISCOVERED_TAG]: 'gcp-discover',
        [ERROR_TAG]: '',
      },
    });
  });

  it('does not re-write an unchanged secret', async () => {
    const { sync, ds, provider } = buildSync();
    provider.discoverSecrets.mockResolvedValue([
      { name: 'token', gcpName: 'token', type: 'opaque', payload: 'abc' },
    ]);
    ds.get.mockResolvedValue({
      name: 'token',
      type: 'opaque',
      data: { payload: 'abc' },
      tags: {
        [SOURCE_TAG]: WORKLOAD,
        [DISCOVERED_TAG]: 'gcp-discover',
        [ERROR_TAG]: '',
      },
    });

    await sync.sync(discoverSecret);

    expect(ds.put).not.toHaveBeenCalled();
    expect(ds.delete).not.toHaveBeenCalled();
  });

  it('deletes then recreates a secret whose cpln type changed', async () => {
    const { sync, ds, provider } = buildSync();
    provider.discoverSecrets.mockResolvedValue([
      { name: 'config', gcpName: 'config', type: 'dictionary', data: { a: '1' } },
    ]);
    ds.get.mockResolvedValue({
      name: 'config',
      type: 'opaque',
      data: { payload: 'old' },
      tags: { [SOURCE_TAG]: WORKLOAD },
    });
    ds.put.mockResolvedValue({});

    await sync.sync(discoverSecret);

    expect(ds.delete).toHaveBeenCalledWith(secretPath('config'));
    expect(ds.put).toHaveBeenCalledWith(
      secretPath('config'),
      expect.objectContaining({ type: 'dictionary', data: { a: '1' } }),
    );
  });

  it('reports secrets owned by another ESS but still syncs the rest', async () => {
    const { sync, ds, provider } = buildSync();
    provider.discoverSecrets.mockResolvedValue([
      { name: 'owned', gcpName: 'owned', type: 'opaque', payload: 'x' },
      { name: 'mine', gcpName: 'mine', type: 'opaque', payload: 'y' },
    ]);
    ds.get.mockImplementation((path: string) =>
      path === revealPath('owned')
        ? Promise.resolve({
            name: 'owned',
            type: 'opaque',
            data: { payload: 'x' },
            tags: { [SOURCE_TAG]: 'another-workload' },
          })
        : Promise.resolve(null),
    );
    ds.put.mockResolvedValue({});

    const result = await sync.sync(discoverSecret);

    expect(result.error).toContain('managed by another ESS');
    expect(ds.put).toHaveBeenCalledTimes(1);
    expect(ds.put).toHaveBeenCalledWith(
      secretPath('mine'),
      expect.objectContaining({ name: 'mine' }),
    );
  });

  it('continues after a failed upsert and aggregates the error', async () => {
    const { sync, ds, provider } = buildSync();
    provider.discoverSecrets.mockResolvedValue([
      { name: 'a', gcpName: 'a', type: 'opaque', payload: '1' },
      { name: 'b', gcpName: 'b', type: 'opaque', payload: '2' },
    ]);
    ds.get.mockResolvedValue(null);
    ds.put.mockImplementation((path: string) =>
      path === secretPath('a')
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({}),
    );

    const result = await sync.sync(discoverSecret);

    expect(result.error).toContain('a: boom');
    expect(ds.put).toHaveBeenCalledTimes(2);
  });

  it('returns the error with empty data when discovery itself fails', async () => {
    const { sync, ds, provider } = buildSync();
    provider.discoverSecrets.mockRejectedValue(new Error('discovery down'));

    const result = await sync.sync(discoverSecret);

    expect(result).toEqual({ data: {}, error: 'discovery down' });
    expect(ds.put).not.toHaveBeenCalled();
  });
});
