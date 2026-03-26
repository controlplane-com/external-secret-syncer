export abstract class Provider<C> {
  constructor(
    public readonly name: string,
    protected readonly config: C,
  ) {}

  abstract getSecret(s: string, parse?: string): Promise<string>;

  getSecrets(path: string): Promise<Record<string, string>> {
    return Promise.reject(
      new Error(
        `Provider ${this.name} does not support bulk secret sync for path ${path}`,
      ),
    );
  }
}
