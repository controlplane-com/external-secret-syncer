export abstract class Provider<C> {
  constructor(
    public readonly name: string,
    protected readonly config: C,
  ) {}

  abstract getSecret(s: string, parse?: string): Promise<string>;

  async getSecrets(_path: string): Promise<Record<string, string>> {
    throw new Error(`Provider ${this.name} does not support bulk secret sync`);
  }
}
