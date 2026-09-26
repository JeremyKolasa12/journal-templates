// Dependency-free validation for csl/styles-index.json.
//
// The index is generated, so this is not guarding against a contributor's typo —
// it is guarding against a BUILD that half-worked. A shallow clone that fetched
// 40 files instead of 10,000, an upstream reorganisation that moved `dependent/`,
// a parent link that points at a style that no longer exists: each of those
// produces a perfectly well-formed JSON file that would quietly ship a catalogue
// with most of the journals missing. So the structural checks are cheap and the
// one that matters is the count floor.
//
//   node csl/validate-style-index.mjs
//
// Exits non-zero on any problem.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const FILE = join(HERE, 'styles-index.json')

/** How far the style count may move between rebuilds before we assume breakage.
 *  Upstream adds a few dozen journals a week; it does not lose a third of them. */
const MAX_DRIFT = 0.15

const errors = []
const err = (msg) => errors.push(msg)

const ID = /^[a-z0-9][a-z0-9._-]*$/

function main() {
  if (!existsSync(FILE)) {
    console.error('csl/styles-index.json is missing — run csl/build-style-index.mjs')
    process.exit(1)
  }

  let index
  try {
    index = JSON.parse(readFileSync(FILE, 'utf8'))
  } catch (e) {
    console.error(`csl/styles-index.json: invalid JSON (${e.message})`)
    process.exit(1)
  }

  if (index.v !== 1) err(`v must be 1, got ${JSON.stringify(index.v)}`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(index.generated))) err('generated must be YYYY-MM-DD')
  if (!Array.isArray(index.formats) || index.formats.some((f) => typeof f !== 'string'))
    err('formats must be an array of strings')
  if (!Array.isArray(index.parents) || index.parents.some((p) => !ID.test(String(p))))
    err('parents must be an array of style ids')
  if (!Array.isArray(index.styles)) {
    err('styles must be an array')
    return report()
  }
  if (index.count !== index.styles.length)
    err(`count (${index.count}) disagrees with styles.length (${index.styles.length})`)

  const formats = index.formats ?? []
  const parents = index.parents ?? []
  const byId = new Map()
  let previousId = ''

  index.styles.forEach((row, i) => {
    const at = `styles[${i}]`
    if (!Array.isArray(row) || row.length !== 5) return err(`${at}: must be a 5-element array`)
    const [id, title, shortTitle, format, parent] = row

    if (typeof id !== 'string' || !ID.test(id)) err(`${at}: bad id ${JSON.stringify(id)}`)
    if (typeof title !== 'string' || !title.trim()) err(`${at} (${id}): title is required`)
    if (shortTitle !== 0 && (typeof shortTitle !== 'string' || !shortTitle.trim()))
      err(`${at} (${id}): shortTitle must be a non-empty string or 0`)
    if (!Number.isInteger(format) || format < -1 || format >= formats.length)
      err(`${at} (${id}): format ${format} is out of range`)
    if (!Number.isInteger(parent) || parent < -1 || parent >= parents.length)
      err(`${at} (${id}): parent ${parent} is out of range`)

    if (byId.has(id)) err(`${at}: duplicate id "${id}"`)
    else byId.set(id, row)

    // Sorted by id, so a rebuild with no upstream change is byte-identical and
    // CI commits nothing.
    if (typeof id === 'string') {
      if (previousId && id < previousId) err(`${at}: "${id}" out of order after "${previousId}"`)
      previousId = id
    }
  })

  // Every parent must exist, and must itself be independent — a dependent style
  // pointing at another dependent style is a chain the consumer will not follow.
  parents.forEach((parentId, i) => {
    const row = byId.get(parentId)
    if (!row) return err(`parents[${i}]: "${parentId}" is not a style in this index`)
    if (row[4] !== -1) err(`parents[${i}]: "${parentId}" is itself dependent`)
  })

  checkCountFloor(index.styles.length)

  report()
}

/** Compare against the committed index, so a truncated build cannot ship. */
function checkCountFloor(count) {
  let previous
  try {
    const raw = execFileSync('git', ['show', 'HEAD:csl/styles-index.json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    previous = JSON.parse(raw).count
  } catch {
    console.log('no committed index to compare against — skipping the count floor')
    return
  }
  if (!Number.isInteger(previous) || previous <= 0) return

  const floor = Math.floor(previous * (1 - MAX_DRIFT))
  if (count < floor) {
    err(
      `only ${count} styles, down from ${previous} — more than ${Math.round(
        MAX_DRIFT * 100,
      )}% below the committed index. Refusing: this is what a half-finished clone looks like.`,
    )
  } else {
    console.log(`count ${count} (was ${previous}) — within ${Math.round(MAX_DRIFT * 100)}%`)
  }
}

function report() {
  if (errors.length) {
    console.error(`csl/styles-index.json: ${errors.length} problem(s)`)
    for (const e of errors.slice(0, 40)) console.error(`  ${e}`)
    if (errors.length > 40) console.error(`  … and ${errors.length - 40} more`)
    process.exit(1)
  }
  console.log('csl/styles-index.json OK')
}

main()
