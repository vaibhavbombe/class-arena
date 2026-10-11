// A tiny schema checker for AI output. The model's JSON is untrusted input: anything that
// doesn't match exactly (wrong types, extra fields, too long) is rejected and retried.
//
// Schema forms:
//   { type: 'string', min, max }            { type: 'number', min, max, integer }
//   { type: 'enum', values: [...] }         { type: 'array', items, min, max }
//   { type: 'object', fields: { name: schema }, optional: ['name'] }

function check(schema, value, path = 'value') {
  switch (schema.type) {
    case 'string': {
      if (typeof value !== 'string') return `${path} must be a string`
      const length = value.trim().length
      if (schema.min !== undefined && length < schema.min) return `${path} is too short`
      if (schema.max !== undefined && value.length > schema.max) return `${path} is too long`
      return null
    }
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${path} must be a number`
      if (schema.integer && !Number.isInteger(value)) return `${path} must be a whole number`
      if (schema.min !== undefined && value < schema.min) return `${path} is too small`
      if (schema.max !== undefined && value > schema.max) return `${path} is too large`
      return null
    case 'enum':
      return schema.values.includes(value) ? null : `${path} must be one of ${schema.values.join(', ')}`
    case 'array': {
      if (!Array.isArray(value)) return `${path} must be an array`
      if (schema.min !== undefined && value.length < schema.min) return `${path} needs at least ${schema.min} items`
      if (schema.max !== undefined && value.length > schema.max) return `${path} can have at most ${schema.max} items`
      for (let i = 0; i < value.length; i++) {
        const error = check(schema.items, value[i], `${path}[${i}]`)
        if (error) return error
      }
      return null
    }
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return `${path} must be an object`
      const optional = new Set(schema.optional || [])
      for (const key of Object.keys(value)) if (!(key in schema.fields)) return `${path}.${key} is not allowed`
      for (const [key, fieldSchema] of Object.entries(schema.fields)) {
        if (!(key in value)) {
          if (optional.has(key)) continue
          return `${path}.${key} is missing`
        }
        const error = check(fieldSchema, value[key], `${path}.${key}`)
        if (error) return error
      }
      return null
    }
    default:
      throw new Error(`Unknown schema type ${schema.type}`)
  }
}

module.exports = { check }
