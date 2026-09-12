// Dependency-free validation for the journal-template catalog.
// Checks every templates/*.json against the basic schema and verifies that
// index.json and the template files agree. Exits non-zero on any problem.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ALLOWED_LIMITS = ['abstractWords', 'mainTextWords', 'references', 'figures']
const errors = []
const err = (where, msg) => errors.push(`${where}: ${msg}`)

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    err(path, `invalid JSON (${e.message})`)
    return null
  }
}

function validateTemplate(path, t) {
  if (!t || typeof t !== 'object') return err(path, 'must be an object')
  if (t.schemaVersion !== 1) err(path, 'schemaVersion must be 1')
  if (typeof t.name !== 'string' || !t.name.trim()) err(path, 'name is required')
  if (t.wordsPerPage !== undefined && !(Number.isInteger(t.wordsPerPage) && t.wordsPerPage > 0))
    err(path, 'wordsPerPage must be a positive integer')
  if (t.limits !== undefined) {
    if (typeof t.limits !== 'object') err(path, 'limits must be an object')
    else
      for (const [k, v] of Object.entries(t.limits)) {
        if (!ALLOWED_LIMITS.includes(k)) err(path, `unknown limit "${k}"`)
        else if (v !== null && !(Number.isInteger(v) && v > 0))
          err(path, `limit "${k}" must be a positive integer or null`)
      }
  }
  if (t.requiredSections !== undefined) {
    if (!Array.isArray(t.requiredSections)) err(path, 'requiredSections must be an array')
    else if (!t.requiredSections.every((s) => typeof s === 'string' && s.trim()))
      err(path, 'requiredSections must be non-empty strings')
  }
}

// Validate every template file.
const files = readdirSync('templates').filter((f) => f.endsWith('.json'))
for (const f of files) {
  const path = join('templates', f)
  const t = readJson(path)
  if (t) validateTemplate(path, t)
}

// Cross-check the index.
const index = readJson('index.json')
if (!Array.isArray(index)) {
  err('index.json', 'must be an array of entries')
} else {
  const listed = new Set()
  for (const e of index) {
    if (!e?.id || !e?.name || !e?.file) err('index.json', `entry missing id/name/file: ${JSON.stringify(e)}`)
    else {
      listed.add(e.file.replace(/^templates\//, ''))
      if (!files.includes(e.file.replace(/^templates\//, '')))
        err('index.json', `entry "${e.id}" points at missing file ${e.file}`)
    }
  }
  for (const f of files) if (!listed.has(f)) err('index.json', `templates/${f} is not listed in index.json`)
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n` + errors.map((e) => `  - ${e}`).join('\n'))
  process.exit(1)
}
console.log(`✓ ${files.length} template(s) valid and index.json consistent.`)
