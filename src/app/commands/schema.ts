/** A small JSON Schema subset: enough to describe command arguments to an AI and to check them. */
export interface Schema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object';
  description?: string;
  enum?: readonly string[];
  minimum?: number;
  maximum?: number;
  /** A regular expression the whole string must match. */
  pattern?: string;
  properties?: Record<string, Schema>;
  required?: readonly string[];
}

export interface ObjectSchema extends Schema {
  type: 'object';
  properties: Record<string, Schema>;
}

/** Why `value` does not fit `schema` (as a sentence for the caller to read), or null when it fits. */
export function validate(schema: Schema, value: unknown, path = 'arguments'): string | null {
  switch (schema.type) {
    case 'string': {
      if (typeof value !== 'string') return `${path} must be a string.`;
      if (schema.enum && !schema.enum.includes(value)) return `${path} must be one of: ${schema.enum.join(', ')}.`;
      if (schema.pattern && !new RegExp(`^(?:${schema.pattern})$`).test(value)) return `${path} must match ${schema.pattern}.`;
      return null;
    }
    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${path} must be a number.`;
      if (schema.type === 'integer' && !Number.isInteger(value)) return `${path} must be a whole number.`;
      if (schema.minimum !== undefined && value < schema.minimum) return `${path} must be at least ${schema.minimum}.`;
      if (schema.maximum !== undefined && value > schema.maximum) return `${path} must be at most ${schema.maximum}.`;
      return null;
    }
    case 'boolean':
      return typeof value === 'boolean' ? null : `${path} must be true or false.`;
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return `${path} must be an object.`;
      const given = value as Record<string, unknown>;
      for (const key of schema.required ?? []) {
        if (given[key] === undefined) return `${path}.${key} is required.`;
      }
      for (const [key, v] of Object.entries(given)) {
        const child = schema.properties?.[key];
        if (!child) return `${path}.${key} is not a known property. Known: ${Object.keys(schema.properties ?? {}).join(', ') || 'none'}.`;
        const problem = validate(child, v, `${path}.${key}`);
        if (problem) return problem;
      }
      return null;
    }
  }
}
