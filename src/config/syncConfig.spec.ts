import { z } from 'zod';
import {
  ConfigSchema,
  ExplicitSecret,
  ProjectDictionarySecret,
  ProviderSchema,
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
  expect(result.data?.secrets[0].dictionaryFromProject?.path).toBe(
    'my-project/dev',
  );
});

test('provider dictionary source requires doppler', () => {
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
    'Secrets using dictionaryFromProject must use a Doppler provider',
  );
});
