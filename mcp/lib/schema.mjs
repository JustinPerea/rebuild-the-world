// A small JSON Schema checker covering the keywords the tool schemas use:
// type, enum, pattern, minimum, maximum, minLength, maxLength, minItems, maxItems,
// properties, required, additionalProperties, items.
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const typeOk = (v, t) => (t === 'number' ? typeof v === 'number' && Number.isFinite(v) : t === 'integer' ? Number.isInteger(v) : typeOf(v) === t);

export function check(schema, value, at = 'arguments') {
  const errs = [];
  const walk = (s, v, p) => {
    if (s.type && !typeOk(v, s.type)) {
      errs.push(`${p} must be ${s.type}, got ${typeOf(v)}`);
      return;
    }
    if (s.enum && !s.enum.includes(v)) errs.push(`${p} must be one of ${s.enum.map((x) => JSON.stringify(x)).join(', ')}`);
    if (typeof v === 'string') {
      if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${p} does not match the pattern ${s.pattern}`);
      if (s.minLength !== undefined && v.length < s.minLength) errs.push(`${p} must have at least ${s.minLength} character(s)`);
      if (s.maxLength !== undefined && v.length > s.maxLength) errs.push(`${p} must have at most ${s.maxLength} characters`);
    }
    if (typeof v === 'number') {
      if (s.minimum !== undefined && v < s.minimum) errs.push(`${p} must be at least ${s.minimum}`);
      if (s.maximum !== undefined && v > s.maximum) errs.push(`${p} must be at most ${s.maximum}`);
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) errs.push(`${p} must have at least ${s.minItems} item(s)`);
      if (s.maxItems !== undefined && v.length > s.maxItems) errs.push(`${p} must have at most ${s.maxItems} items`);
      if (s.items) v.forEach((x, i) => walk(s.items, x, `${p}[${i}]`));
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const r of s.required || []) if (!(r in v)) errs.push(`${p}.${r} is required`);
      for (const [k, x] of Object.entries(v)) {
        if (s.properties?.[k]) walk(s.properties[k], x, `${p}.${k}`);
        else if (s.additionalProperties === false) errs.push(`${p}.${k} is not a known field`);
        else if (s.additionalProperties && typeof s.additionalProperties === 'object') walk(s.additionalProperties, x, `${p}.${k}`);
      }
    }
  };
  walk(schema, value, at);
  return errs;
}
