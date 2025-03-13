import { get } from 'lodash';
import { z } from 'zod';

export const DurationSchema = z
  .string()
  .regex(/^(?:\d+h)?(?:\d+m)?(?:\d+s)?$/)
  .transform((value) => {
    return toMillis(value);
  });

export const toMillis = (duration: string) => {
  const hours = duration.match(/(\d+)h/) || [];
  const minutes = duration.match(/(\d+)m/) || [];
  const seconds = duration.match(/(\d+)s/) || [];

  return (
    (parseInt(hours[1] ?? '0') * 60 * 60 +
      parseInt(minutes[1] ?? '0') * 60 +
      parseInt(seconds[1] ?? '0')) *
    1000
  );
};

export const xor =
  <T>(...keys: string[]) =>
  (data: T) => {
    const usedKeys = keys.filter((key) => data[key] !== undefined);
    return usedKeys.length === 1;
  };

export const atLeastOne =
  <T>(...keys: string[]) =>
  (data: T) => {
    const usedKeys = keys.filter((key) => data[key] !== undefined);
    return usedKeys.length >= 1;
  };

export const unique =
  <T, V>(path: string) =>
  (data: T[]) => {
    const fieldValues = data.map((item) => get(item, path) as V);
    return fieldValues.length === new Set(fieldValues).size;
  };
