import { readFileSync } from 'node:fs';
import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction
} from 'ajv/dist/2020.js';

const schemaPath = new URL('../schema/shishan-ir.schema.json', import.meta.url);
export const shishanIrSchema: object = JSON.parse(
  readFileSync(schemaPath, 'utf8')
) as object;

const ajv = new Ajv2020({
  allErrors: true,
  strict: true
});

const validate: ValidateFunction = ajv.compile(shishanIrSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function formatError(error: ErrorObject): string {
  const location = error.instancePath || '/';
  return location + ' ' + error.message;
}

export function validateProtocolPayload(value: unknown): ValidationResult {
  const valid = validate(value);
  return {
    valid,
    errors: valid ? [] : (validate.errors ?? []).map(formatError)
  };
}

export function assertProtocolPayload(value: unknown): void {
  const result = validateProtocolPayload(value);
  if (!result.valid) {
    throw new Error('Invalid ShiShan protocol payload:\n' + result.errors.join('\n'));
  }
}
