/**
 * Flatten a JSON object into a flat map of dot-separated paths to scalar values.
 *
 * Used by the `dictionaryFromJson` sync type: ESS fetches a JSON object from
 * the provider and exposes each leaf value under a dot-notation key in the
 * resulting CPLN dictionary secret.
 *
 * Behavior:
 *  - Nested objects are recursively walked; arrays are JSON-stringified
 *    (CPLN dictionary values must be strings, not arrays).
 *  - `null` values are stringified to "null" to preserve the key.
 *
 * Example:
 *  flattenJson({ db: { user: "admin" }, tags: ["a", "b"] })
 *    → { "db.user": "admin", "tags": '["a","b"]' }
 */
export function flattenJson(
  obj: Record<string, unknown>,
  prefix = '',
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      Object.assign(
        result,
        flattenJson(value as Record<string, unknown>, newKey),
      );
    } else if (Array.isArray(value)) {
      result[newKey] = JSON.stringify(value);
    } else {
      result[newKey] = String(value);
    }
  }
  return result;
}

/**
 * Try to parse a string as a JSON object. Returns `null` if the value is not
 * a valid JSON object (e.g. a raw string, number, array, or malformed JSON).
 * Arrays and scalars at the root are not considered objects.
 */
export function tryParseJsonObject(
  raw: string,
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
