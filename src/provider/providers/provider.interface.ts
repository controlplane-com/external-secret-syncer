export abstract class Provider<C> {
  constructor(
    public readonly name: string,
    protected readonly config: C,
  ) {}

  abstract getSecret(s: string, parse?: string): Promise<string>;
}
