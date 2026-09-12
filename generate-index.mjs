// Regenerate index.json from templates/*.json so contributors only add one file.
// The app reads index.json to list the catalog; CI runs this and commits any
// change on main.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const files = readdirSync('templates')
  .filter((f) => f.endsWith('.json'))
  .sort()

const entries = files.map((f) => {
  const t = JSON.parse(readFileSync(join('templates', f), 'utf8'))
  const id = f.replace(/\.json$/, '')
  const entry = { id, name: t.name ?? id, file: `templates/${f}` }
  if (t.publisher) entry.publisher = t.publisher
  // keep a stable key order: id, name, publisher, file
  return t.publisher ? { id, name: entry.name, publisher: t.publisher, file: entry.file } : entry
})

writeFileSync('index.json', JSON.stringify(entries, null, 2) + '\n')
console.log(`Wrote index.json with ${entries.length} template(s).`)
