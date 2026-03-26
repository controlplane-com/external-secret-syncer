import { get } from 'lodash';
import yaml from 'js-yaml';

export function jsonParse(secret: string, parse: string): string {
  try {
    const secretObj = JSON.parse(secret) as JSON;
    const data = get(secretObj, parse, undefined);

    if (!data) {
      throw new Error(`path ${parse} did not lead to a valid value`);
    }

    if (typeof data === 'object') {
      return JSON.stringify(data);
    }

    return String(data);
  } catch (e) {
    console.error(`Error parsing secret: ${e.message}`);
    throw new Error('Secret is not a valid JSON object');
  }
}

export function yamlParse(secret: string, parse: string): string {
  try {
    const secretObj = yaml.load(secret) as JSON;
    const data = get(secretObj, parse, undefined);

    if (!data) {
      throw new Error(`path ${parse} did not lead to a valid value`);
    }

    if (typeof data === 'object') {
      return JSON.stringify(data);
    }

    return String(data);
  } catch (e) {
    console.error(`Error parsing secret: ${e.message}`);
    throw new Error('Secret is not a valid YAML object');
  }
}
