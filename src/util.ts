export function sleep(millis: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, millis);
  });
}

/**
 * Coerce an arbitrary provider secret name into a valid Control Plane resource
 * name. CPLN names must be lowercase and may only contain letters, digits and
 * hyphens, must start with a letter, end with a letter or digit, and be at most
 * 63 characters long.
 *
 * Used by `discoverAllSecrets`: GCP secret IDs allow uppercase letters and
 * underscores (e.g. `MY_API_KEY`), which CPLN rejects, so each discovered
 * secret name is normalized before it is written.
 *
 * Example: `MY_API_KEY` → `my-api-key`, `Service.Token` → `service-token`.
 */
export function sanitizeCplnName(name: string): string {
  let result = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-') // invalid chars → hyphen
    .replace(/-{2,}/g, '-') // collapse runs of hyphens
    .replace(/^-+/, '') // trim leading hyphens
    .replace(/-+$/, ''); // trim trailing hyphens

  if (result.length === 0) {
    return 'secret';
  }

  // must start with a letter
  if (!/^[a-z]/.test(result)) {
    result = `s-${result}`;
  }

  // enforce max length, without leaving a trailing hyphen
  return result.slice(0, 63).replace(/-+$/, '');
}
