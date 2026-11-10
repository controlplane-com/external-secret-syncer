import { z } from 'zod';
import {
  ConfigSchema,
  ExplicitSecret,
  ProjectDictionarySecret,
  ProviderSchema,
  removeSensitive,
  SENSITIVE_PROVIDER_FIELDS,
} from './syncConfig';

test('secret with invalid provider', () => {
  const schema: z.input<typeof ConfigSchema> = {
    providers: [
      {
        name: 'my-provider',
        vault: {
          address: 'http://localhost:8200',
          token: 'token',
        },
      },
    ],
    secrets: [
      {
        name: 'secret',
        provider: 'invalid',
        opaque: 'default',
      },
    ],
  };

  const result = ConfigSchema.safeParse(schema);
  expect(result.error?.issues[0].message).toBe(
    'Secrets must have a valid provider',
  );
});

test('provider with multiple providers', () => {
  const schema: z.input<typeof ConfigSchema> = {
    providers: [
      {
        name: 'my-provider',
        vault: {
          address: 'http://localhost:8200',
          token: 'token',
        },
        awsSecretsManager: {
          region: 'us-west-2',
        },
      },
    ],
    secrets: [
      {
        name: 'secret',
        provider: 'my-provider',
        opaque: 'default',
      },
    ],
  };

  const result = ConfigSchema.safeParse(schema);
  expect(result.error?.issues[0].message).toContain(
    'must have exactly one provider',
  );
});

test('path', () => {
  const validPaths = [
    'bar.baz.bill',
    'bar[2].hi',
    "bar['hello'].baz.bill",
    "foo[0].bar['baz'].qux",
    "obj['key'][42].prop",
    "array[123]['nested'][0]",
    'hi[0]',
  ];

  const invalidPaths = [
    'bar.baz.',
    'bar[2].',
    "bar['hello'].baz.",
    "foo[0].bar['baz'].",
    "obj['key'][42].",
    'hi..there',
  ];

  for (const parse of validPaths) {
    expect(
      ExplicitSecret.safeParse({ parse, default: 'hi' }).success,
    ).toBeTruthy();
  }

  for (const parse of invalidPaths) {
    expect(
      ExplicitSecret.safeParse({ parse, default: 'hi' }).success,
    ).toBeFalsy();
  }
});

test('base64 encoding', () => {
  const secret: z.input<typeof ExplicitSecret> = {
    encoding: 'base64',
    default: 'default',
    path: '/path/to/secret',
  };

  const result = ExplicitSecret.safeParse(secret);
  expect(result.success).toBeTruthy();
  expect(result.data?.encoding).toBe('base64');
});

test('no base64 encoding', () => {
  const secret: z.input<typeof ExplicitSecret> = {
    default: 'default',
    path: '/path/to/secret',
  };

  const result = ExplicitSecret.safeParse(secret);
  expect(result.success).toBeTruthy();
  expect(result.data?.encoding).toBeUndefined();
});

test('1password', () => {
  const provider: z.input<typeof ProviderSchema> = {
    name: '1password',
    onePassword: {
      serviceAccountToken: 'test-token',
    },
  };

  const result = ProviderSchema.safeParse(provider);
  expect(result.success).toBeTruthy();
  expect(result.data?.onePassword).toBeDefined();
});

test('doppler', () => {
  const provider: z.input<typeof ProviderSchema> = {
    name: 'doppler',
    doppler: {
      accessToken: 'test-token',
    },
  };
  const result = ProviderSchema.safeParse(provider);
  expect(result.success).toBeTruthy();
  expect(result.data?.doppler).toBeDefined();
});

test('provider dictionary secret', () => {
  const secret: z.input<typeof ProjectDictionarySecret> = {
    path: 'my-project/dev',
  };

  const result = ProjectDictionarySecret.safeParse(secret);
  expect(result.success).toBeTruthy();
  expect(result.data?.path).toBe('my-project/dev');
});

test('provider dictionary secret rejects invalid path', () => {
  const invalidPaths = ['my-project', 'my-project/dev/extra', ' / ', '//dev'];

  for (const path of invalidPaths) {
    expect(ProjectDictionarySecret.safeParse({ path }).success).toBeFalsy();
  }
});

test('secret with provider dictionary source', () => {
  const schema: z.input<typeof ConfigSchema> = {
    providers: [
      {
        name: 'doppler',
        doppler: {
          accessToken: 'test-token',
        },
      },
    ],
    secrets: [
      {
        name: 'doppler-project',
        provider: 'doppler',
        dictionaryFromProject: {
          path: 'my-project/dev',
        },
      },
    ],
  };

  const result = ConfigSchema.safeParse(schema);
  expect(result.success).toBeTruthy();
  const dfp = result.data?.secrets[0].dictionaryFromProject;
  expect(typeof dfp === 'object' && dfp.path).toBe('my-project/dev');
});

test('provider dictionary source rejects unsupported provider', () => {
  const schema: z.input<typeof ConfigSchema> = {
    providers: [
      {
        name: 'vault',
        vault: {
          address: 'http://localhost:8200',
          token: 'token',
        },
      },
    ],
    secrets: [
      {
        name: 'vault-project',
        provider: 'vault',
        dictionaryFromProject: {
          path: 'my-project/dev',
        },
      },
    ],
  };

  const result = ConfigSchema.safeParse(schema);
  expect(result.error?.issues[0].message).toBe(
    'dictionaryFromProject must use `true` with a gcpSecretManager provider, or a path object with a Doppler provider',
  );
});

test('secret with gcp dictionaryFromProject', () => {
  const schema: z.input<typeof ConfigSchema> = {
    providers: [
      {
        name: 'gcp',
        gcpSecretManager: {
          projectId: 'my-gcp-project',
        },
      },
    ],
    secrets: [
      {
        name: 'gcp-project',
        provider: 'gcp',
        dictionaryFromProject: true,
      },
    ],
  };

  const result = ConfigSchema.safeParse(schema);
  expect(result.success).toBeTruthy();
  expect(result.data?.secrets[0].dictionaryFromProject).toBe(true);
});

test('gcp dictionaryFromProject rejects path object', () => {
  const schema: z.input<typeof ConfigSchema> = {
    providers: [
      {
        name: 'gcp',
        gcpSecretManager: {
          projectId: 'my-gcp-project',
        },
      },
    ],
    secrets: [
      {
        name: 'gcp-project',
        provider: 'gcp',
        dictionaryFromProject: {
          path: 'my-project/dev',
        },
      },
    ],
  };

  const result = ConfigSchema.safeParse(schema);
  expect(result.success).toBeFalsy();
});

test('doppler dictionaryFromProject rejects boolean', () => {
  const schema: z.input<typeof ConfigSchema> = {
    providers: [
      {
        name: 'doppler',
        doppler: {
          accessToken: 'test-token',
        },
      },
    ],
    secrets: [
      {
        name: 'doppler-project',
        provider: 'doppler',
        dictionaryFromProject: true,
      },
    ],
  };

  const result = ConfigSchema.safeParse(schema);
  expect(result.success).toBeFalsy();
});

test('secret with gcp discoverAllSecrets', () => {
  const schema: z.input<typeof ConfigSchema> = {
    providers: [
      {
        name: 'gcp',
        gcpSecretManager: {
          projectId: 'my-gcp-project',
        },
      },
    ],
    secrets: [
      {
        name: 'gcp-discover',
        provider: 'gcp',
        discoverAllSecrets: true,
      },
    ],
  };

  const result = ConfigSchema.safeParse(schema);
  expect(result.success).toBeTruthy();
  expect(result.data?.secrets[0].discoverAllSecrets).toBe(true);
});

test('discoverAllSecrets rejects non-gcp provider', () => {
  const schema: z.input<typeof ConfigSchema> = {
    providers: [
      {
        name: 'doppler',
        doppler: {
          accessToken: 'test-token',
        },
      },
    ],
    secrets: [
      {
        name: 'doppler-discover',
        provider: 'doppler',
        discoverAllSecrets: true,
      },
    ],
  };

  const result = ConfigSchema.safeParse(schema);
  expect(result.error?.issues[0].message).toBe(
    'discoverAllSecrets is only supported with a gcpSecretManager provider',
  );
});

test('discoverAllSecrets cannot combine with another secret type', () => {
  const schema: z.input<typeof ConfigSchema> = {
    providers: [
      {
        name: 'gcp',
        gcpSecretManager: {
          projectId: 'my-gcp-project',
        },
      },
    ],
    secrets: [
      {
        name: 'gcp-discover',
        provider: 'gcp',
        discoverAllSecrets: true,
        opaque: 'some/secret',
      },
    ],
  };

  const result = ConfigSchema.safeParse(schema);
  expect(result.error?.issues[0].message).toBe(
    'Secrets must only reference one secret type',
  );
});

describe('removeSensitive', () => {
  const LEAK = 'LEAKED-CREDENTIAL';

  const config = ConfigSchema.parse({
    providers: [
      {
        name: 'vault',
        vault: { address: 'http://localhost:8200', token: LEAK + '-vault' },
      },
      {
        name: 'asm',
        awsSecretsManager: {
          region: 'us-east-1',
          accessKeyId: LEAK + '-asm-id',
          secretAccessKey: LEAK + '-asm-key',
        },
      },
      {
        name: 'ssm',
        awsParameterStore: {
          region: 'us-east-1',
          accessKeyId: LEAK + '-ssm-id',
          secretAccessKey: LEAK + '-ssm-key',
        },
      },
      {
        name: 'op',
        onePassword: { serviceAccountToken: LEAK + '-op' },
      },
      {
        name: 'opc',
        onePasswordConnect: {
          serverURL: 'http://localhost:8080',
          token: LEAK + '-opc',
        },
      },
      { name: 'doppler', doppler: { accessToken: LEAK + '-doppler' } },
      {
        name: 'gcp',
        gcpSecretManager: {
          projectId: 'p',
          credentials: {
            clientEmail: 'sa@p.iam.gserviceaccount.com',
            privateKey: LEAK + '-gcp',
          },
        },
      },
      {
        name: 'infisical',
        infisical: {
          projectId: 'p',
          clientId: LEAK + '-inf-id',
          clientSecret: LEAK + '-inf-secret',
        },
      },
    ],
    secrets: [
      {
        name: 'opaque',
        provider: 'vault',
        opaque: { path: 'a', default: LEAK + '-opaque-default' },
      },
      {
        name: 'dict',
        provider: 'vault',
        dictionary: {
          implicit: 'some/path',
          explicit: { path: 'b', default: LEAK + '-dict-default' },
        },
      },
    ],
  });

  test('every provider in the schema has its sensitive fields declared', () => {
    const providerKinds = Object.keys(ProviderSchema.shape).filter(
      (k) => k !== 'name' && k !== 'syncInterval',
    );
    expect(Object.keys(SENSITIVE_PROVIDER_FIELDS).sort()).toEqual(
      providerKinds.sort(),
    );
    // the fixture above must cover every provider so the leak check is complete
    const configured = config.providers.flatMap((p) =>
      providerKinds.filter((k) => p[k] !== undefined),
    );
    expect(configured.sort()).toEqual(providerKinds.sort());
  });

  test('masks credentials of all providers and secret defaults', () => {
    const result = removeSensitive(config);
    expect(JSON.stringify(result)).not.toContain(LEAK);
  });

  test('keeps non-sensitive fields and does not mutate the input', () => {
    const result = removeSensitive(config);
    expect(result.providers[0].vault?.address).toBe('http://localhost:8200');
    expect(result.secrets[1].dictionary?.implicit).toBe('some/path');
    expect(result.providers[0].vault?.token).toBe('***********');
    expect(config.providers[0].vault?.token).toBe(LEAK + '-vault');
  });

  test('leaves unset optional credentials untouched', () => {
    const result = removeSensitive(
      ConfigSchema.parse({
        providers: [
          { name: 'asm', awsSecretsManager: { region: 'us-east-1' } },
          { name: 'gcp', gcpSecretManager: { projectId: 'p' } },
        ],
        secrets: [],
      }),
    );
    expect(result.providers[0].awsSecretsManager?.accessKeyId).toBeUndefined();
    expect(result.providers[1].gcpSecretManager?.credentials).toBeUndefined();
  });
});
