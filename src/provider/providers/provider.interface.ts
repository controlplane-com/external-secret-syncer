/**
 * A single secret returned by `getSecrets`. `type`, when present (currently only
 * GCP, derived from the `cpln-type` label), tells the `discoverAllSecrets` flow
 * whether to materialize the value as an opaque or a (flattened JSON) dictionary
 * secret. Providers without a type concept simply omit it.
 */
export interface ProviderSecretValue {
  value: string;
  type?: 'opaque' | 'dictionary';
}

export abstract class Provider<C> {
  constructor(
    public readonly name: string,
    protected readonly config: C,
  ) {}

  abstract getSecret(s: string, parse?: string): Promise<string>;

  getSecrets(path?: string): Promise<Record<string, ProviderSecretValue>> {
    return Promise.reject(
      new Error(
        `Provider ${this.name} does not support bulk secret sync${path ? ` for path ${path}` : ''}`,
      ),
    );
  }
}
