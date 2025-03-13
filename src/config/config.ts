import { z, ZodError } from 'zod';
import { DurationSchema } from './common';
import { logger } from './logging';

const ConfigSchema = z
  .object({
    CPLN_ORG: z.string(),
    CPLN_WORKLOAD: z.string(),
    CPLN_CACHE_SECONDS: z.coerce.number().int().positive().default(300),
    CPLN_ENDPOINT: z.string().default('https://api.cpln.io'),
    CPLN_TOKEN: z.string(),
    DEFAULT_SYNC_INTERVAL: DurationSchema.default('300s'),
    PORT: z.coerce.number().int().positive().min(1).max(65535).default(3004),
  })
  .strip()
  .readonly();

export type ConfigType = z.infer<typeof ConfigSchema>;
export const CONFIG_KEY = 'config';

export const config = () => {
  try {
    const config = ConfigSchema.parse(process.env);
    return config;
  } catch (e) {
    logger.error({ err: e as ZodError }, `Error parsing env config`);
    process.exit(1);
  }
};
