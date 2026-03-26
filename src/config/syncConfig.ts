import * as yaml from 'js-yaml';
import { join } from 'path';
import { z, ZodError } from 'zod';
import { atLeastOne, DurationSchema, unique, xor } from './common';
import { readFile } from 'fs/promises';
import { cloneDeep } from 'lodash';
import { logger } from './logging';

const SYNC_CONFIG_PATH = process.env.SYNC_CONFIG_PATH ?? 'sync.yaml';
const SENSITIVE = '***********';

const VaultSchmea = z.object({
  address: z.string().url(),
  token: z.string(),
});

const AwsSecretsManagerSchema = z.object({
  region: z.string(),
  endpoint: z.string().url().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
});

const AwsParameterStoreSchema = z.object({
  region: z.string(),
  endpoint: z.string().url().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
});

const OnePasswordSchema = z.object({
  serviceAccountToken: z
    .string()
    .default(process.env.OP_SERVICE_ACCOUNT_TOKEN ?? ''),
  integrationName: z.string().default('syncer.cpln.io'),
  integrationVersion: z.string().default(process.env.IMAGE_VERSION ?? 'v1.0.0'),
});

const DopplerSchema = z.object({
  accessToken: z.string(),
});

const GcpSecretManagerSchema = z.object({
  projectId: z.coerce.string(),
  credentials: z
    .object({
      clientEmail: z.string(),
      privateKey: z.string(),
    })
    .optional(),
});

export const ProviderSchema = z
  .object({
    name: z.string(),
    syncInterval: DurationSchema.optional(),
    vault: VaultSchmea.optional(),
    awsSecretsManager: AwsSecretsManagerSchema.optional(),
    awsParameterStore: AwsParameterStoreSchema.optional(),
    onePassword: OnePasswordSchema.optional(),
    doppler: DopplerSchema.optional(),
    gcpSecretManager: GcpSecretManagerSchema.optional(),
  })
  .refine(
    xor(
      'vault',
      'awsSecretsManager',
      'awsParameterStore',
      'onePassword',
      'doppler',
      'gcpSecretManager',
    ),
    {
      message: 'Provider must have exactly one provider',
    },
  );
export const Encoding = z.enum(['base64']);

export const ImplicitSecret = z.string().nonempty();
export const ExplicitSecret = z
  .object({
    default: z.coerce.string().optional(),
    path: z.coerce.string().optional(),
    parse: z
      .string()
      .regex(
        /^(?:[a-zA-Z_]\w*|\[\d+\]|\['[^']+'\]|\["[^"]+"\])(?:\.(?:[a-zA-Z_]\w*)|\[\d+\]|\['[^']+'\]|\["[^"]+"\])*$/,
      )
      .optional(),
    encoding: Encoding.optional(),
  })
  .refine(atLeastOne('default', 'path'), {
    message: 'Secret must have a default and/or path',
  });
export const ProjectDictionarySecret = z.object({
  path: z
    .string()
    .trim()
    .regex(/^\/?[^/\s]+\/[^/\s]+$/, {
      message:
        'Project dictionary path must be in the format "project/config"',
    }),
});

const SecretSchema = z
  .object({
    name: z.string(),
    provider: z.string(),
    syncInterval: DurationSchema.optional(),
    opaque: z.union([ImplicitSecret, ExplicitSecret]).optional(),
    dictionary: z
      .record(z.string().nonempty(), z.union([ImplicitSecret, ExplicitSecret]))
      .optional(),
    dictionaryFromProject: ProjectDictionarySecret.optional(),
  })
  .refine(xor('opaque', 'dictionary', 'dictionaryFromProject'), {
    message: 'Secrets must only reference one secret type',
  });

export const ConfigSchema = z
  .object({
    providers: z
      .array(ProviderSchema)
      .refine(unique('name'), { message: 'Provider names must be unique' }),
    secrets: z.array(SecretSchema).refine(unique('name'), {
      message: 'Secret names must be unique',
    }),
  })
  .readonly()
  .refine(
    (config) => {
      const providerNames = config.providers.map((provider) => provider.name);
      const secretProviders = config.secrets.map((secret) => secret.provider);

      for (const secretProvider of secretProviders) {
        if (!providerNames.includes(secretProvider)) {
          return false;
        }
      }

      return true;
    },
    { message: 'Secrets must have a valid provider' },
  )
  .refine(
    (config) => {
      for (const secret of config.secrets) {
        if (!secret.dictionaryFromProject) {
          continue;
        }

        const provider = config.providers.find((p) => p.name === secret.provider);
        if (!provider?.doppler) {
          return false;
        }
      }

      return true;
    },
    {
      message:
        'Secrets using dictionaryFromProject must use a Doppler provider',
    },
  );

export const removeSensitive = (config: SyncConfigType) => {
  const result = cloneDeep(config);
  result.providers.forEach((provider) => {
    if (provider.vault) {
      provider.vault.token = SENSITIVE;
    }
    if (
      provider.awsSecretsManager &&
      provider.awsSecretsManager.secretAccessKey
    ) {
      provider.awsSecretsManager.secretAccessKey = SENSITIVE;
    }
    if (provider.awsSecretsManager && provider.awsSecretsManager.accessKeyId)
      provider.awsSecretsManager.accessKeyId = SENSITIVE;
    if (provider.doppler) {
      provider.doppler.accessToken = SENSITIVE;
    }
    if (provider.gcpSecretManager?.credentials) {
      provider.gcpSecretManager.credentials.privateKey = SENSITIVE;
    }
  });
  return result;
};

export const syncConfig = async () => {
  const syncFile = yaml.load(
    await readFile(join(SYNC_CONFIG_PATH), 'utf8'),
  ) as Record<string, any>;

  try {
    const config = ConfigSchema.parse(syncFile);
    return config;
  } catch (e) {
    logger.error({ err: e as ZodError }, `Error parsing sync config`);
    process.exit(1);
  }
};

export const SYNC_CONIFG_KEY = 'syncConfig';

export const isDictionarySecret = (secret: Secret) =>
  Boolean(secret.dictionary || secret.dictionaryFromProject);

export type SyncConfigType = z.infer<typeof ConfigSchema>;
export type Secret = z.infer<typeof SecretSchema>;
export type Encoding = z.infer<typeof Encoding>;
export type VaultConfig = z.infer<typeof VaultSchmea>;
export type ExplicitSecret = z.infer<typeof ExplicitSecret>;
export type ProjectDictionarySecret = z.infer<typeof ProjectDictionarySecret>;
export type AwsSecretsManagerConfig = z.infer<typeof AwsSecretsManagerSchema>;
export type AwsParameterStoreConfig = z.infer<typeof AwsParameterStoreSchema>;
export type OnePasswordConfig = z.infer<typeof OnePasswordSchema>;
export type DopplerConfig = z.infer<typeof DopplerSchema>;
export type GcpSecretManagerConfig = z.infer<typeof GcpSecretManagerSchema>;
