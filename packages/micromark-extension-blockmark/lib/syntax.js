/**
 * @typedef {Object} BlockmarkPrefix
 * @property {string} id
 * @property {Record<string, string>} attributes
 * @property {string} raw - The full prefix string including `^[` and `] `
 */

const ID_PATTERN = '[a-zA-Z_][a-zA-Z0-9\\-_.]*'
const ATTR_VALUE = '(?:"[^"]*"|[^\\s\\]]+)'
const ATTR_PATTERN = `[a-zA-Z][a-zA-Z0-9\\-_]*=${ATTR_VALUE}`
const ATTRS_PATTERN = `(?:\\s+${ATTR_PATTERN})*`

const BLOCKMARK_RE = new RegExp(
  `^\\^\\[(${ID_PATTERN})(${ATTRS_PATTERN})\\] `
)

/**
 * Parse a blockmark prefix from the start of a string.
 *
 * Returns `null` if the string does not start with a valid `^[id attrs] ` prefix.
 *
 * @param {string} text
 * @returns {BlockmarkPrefix | null}
 */
export function parseBlockmarkPrefix(text) {
  const match = BLOCKMARK_RE.exec(text)
  if (!match) return null

  const id = match[1]
  const rawAttrs = match[2]
  const attributes = parseAttributes(rawAttrs)

  return { id, attributes, raw: match[0] }
}

/**
 * Serialize a blockmark prefix back to its string form.
 *
 * @param {{ id: string, attributes?: Record<string, string> }} prefix
 * @returns {string}
 */
export function serializeBlockmarkPrefix(prefix) {
  let result = `^[${prefix.id}`

  if (prefix.attributes) {
    for (const [key, value] of Object.entries(prefix.attributes)) {
      if (value.includes(' ') || value.includes(']')) {
        result += ` ${key}="${value}"`
      } else {
        result += ` ${key}=${value}`
      }
    }
  }

  return result + '] '
}

/**
 * @param {string} raw
 * @returns {Record<string, string>}
 */
function parseAttributes(raw) {
  /** @type {Record<string, string>} */
  const attrs = {}
  if (!raw || !raw.trim()) return attrs

  const attrRe = new RegExp(`(${ATTR_PATTERN})`, 'g')
  let m
  while ((m = attrRe.exec(raw)) !== null) {
    const eqIndex = m[1].indexOf('=')
    const key = m[1].slice(0, eqIndex)
    let value = m[1].slice(eqIndex + 1)
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }
    attrs[key] = value
  }

  return attrs
}
