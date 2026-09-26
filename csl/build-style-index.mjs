// Build a compact, searchable index of the CSL styles repo.
//
// The Citation Style Language repo (citation-style-language/styles) ships ~2.7k
// independent styles plus ~9k dependent stubs, and NO manifest — so an app that
// wants to let a writer search for their journal by name has nothing to search.
// jsDelivr can list the repo's filenames, but a filename is a slug: nobody
// looking for JAMA types "american-medical-association". The titles are only
// inside the files.
//
// So we read them once, here, and publish the result as one small file over the
// same CDN the template catalog already uses.
//
// Dependency-free by the same rule as `validate.mjs`. Usage:
//
//   node csl/build-style-index.mjs --styles <path-to-cloned-styles-repo>
//
// Writes csl/styles-index.json. Deterministic: rows sorted by id, so an unchanged
// upstream produces a byte-identical file and CI commits nothing.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'styles-index.json')

/**
 * The `citation-format` values CSL defines. Published inside the index rather
 * than hardcoded in the consumer, so adding one here can't silently shift every
 * existing row's meaning.
 */
const FORMATS = ['author-date', 'numeric', 'note', 'label', 'author']

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

/** XML entities that actually occur in style titles (&, <, >, ', ", numerics). */
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // `&amp;` last, so `&amp;lt;` decodes to the text `&lt;` and not to `<`.
    .replace(/&amp;/g, '&')
}

function text(block, tag) {
  // `[^]` rather than `.` with /s for the odd title broken across lines.
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))
  if (!m) return ''
  return decodeEntities(m[1]).replace(/\s+/g, ' ').trim()
}

/** The id at the end of a style URL: `…/styles/elsevier-vancouver` → that. */
function idFromHref(href) {
  const path = String(href).split(/[?#]/)[0]
  const last = path.split('/').pop() ?? ''
  return /^[a-z0-9][a-z0-9-]*$/i.test(last) ? last : ''
}

/**
 * Everything the index needs from one `.csl` file. Reads only `<info>`: the rest
 * of a style is layout, and a `<title>` can legitimately appear in a macro.
 */
function parseStyle(id, xml) {
  const info = xml.match(/<info[^>]*>([\s\S]*?)<\/info>/)
  if (!info) return null
  const block = info[1]

  const title = text(block, 'title')
  if (!title) return null

  // `<title-short>` is how the repo spells an abbreviation (JAMA, PNAS, JACS) —
  // which is how people actually refer to journals, so it is worth its bytes.
  const shortTitle = text(block, 'title-short')

  const fmt = block.match(/<category\s[^>]*citation-format="([^"]+)"/)
  const format = fmt ? FORMATS.indexOf(fmt[1]) : -1

  const parentLink = block.match(/<link\s[^>]*rel="independent-parent"[^>]*\/?>/)
  let parent = ''
  if (parentLink) {
    const href = parentLink[0].match(/href="([^"]+)"/)
    parent = href ? idFromHref(href[1]) : ''
  }

  return { id, title, shortTitle, format, parent, unknownFormat: fmt ? fmt[1] : '' }
}

function cslFilesIn(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.csl'))
    .sort()
}

function main() {
  const stylesRepo = arg('--styles', '')
  if (!stylesRepo || !existsSync(stylesRepo)) {
    console.error(
      'usage: node csl/build-style-index.mjs --styles <path-to-cloned-citation-style-language/styles>',
    )
    process.exit(2)
  }

  const warnings = []
  const parsed = []

  // Independent styles live at the repo root; dependent stubs under `dependent/`.
  // Both are served by jsDelivr, and the consumer already tries root then
  // `dependent/`, so the index does not need to record which is which — a row
  // with a parent IS a dependent one.
  for (const [dir, where] of [
    [stylesRepo, 'root'],
    [join(stylesRepo, 'dependent'), 'dependent'],
  ]) {
    for (const file of cslFilesIn(dir)) {
      const id = file.slice(0, -4)
      const style = parseStyle(id, readFileSync(join(dir, file), 'utf8'))
      if (!style) {
        warnings.push(`${where}/${file}: no <info><title>, skipped`)
        continue
      }
      if (style.format === -1 && style.unknownFormat) {
        warnings.push(`${where}/${file}: unknown citation-format "${style.unknownFormat}"`)
      }
      if (where === 'dependent' && !style.parent) {
        warnings.push(`${where}/${file}: dependent stub with no resolvable parent`)
      }
      parsed.push(style)
    }
  }

  parsed.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  // A de-duplicated parent table: ~9k dependents point at a few hundred distinct
  // parents, so a small integer per row beats repeating the id nine thousand
  // times — before compression, and it keeps the file readable.
  const parents = []
  const parentIndex = new Map()
  const parentIdx = (id) => {
    if (!id) return -1
    if (!parentIndex.has(id)) {
      parentIndex.set(id, parents.length)
      parents.push(id)
    }
    return parentIndex.get(id)
  }

  // [id, title, shortTitle | 0, formatIdx, parentIdx]
  //   shortTitle 0 → none
  //   formatIdx -1 → the style declares no citation-format (inherit the parent's)
  //   parentIdx -1 → independent
  const styles = parsed.map((s) => [
    s.id,
    s.title,
    s.shortTitle || 0,
    s.format,
    parentIdx(s.parent),
  ])

  const head = upstreamHead(stylesRepo)
  const index = {
    v: 1,
    // The upstream commit's date, NOT the wall clock — otherwise a weekly
    // rebuild of an unchanged catalogue produced a different file every time,
    // and CI committed and tagged a new version that held identical styles.
    // Keyed to upstream, an unchanged catalogue rebuilds byte-identically.
    generated: head.date,
    source: {
      repo: 'citation-style-language/styles',
      commit: head.commit,
    },
    count: styles.length,
    formats: FORMATS,
    fields: ['id', 'title', 'shortTitle', 'format', 'parent'],
    parents,
    styles,
  }

  mkdirSync(HERE, { recursive: true })
  // One row per line: a diff of a weekly rebuild shows the styles that changed,
  // not one 700KB line. Costs ~10KB uncompressed and nothing at all over the
  // wire, since the CDN serves this compressed.
  writeFileSync(OUT, serialize(index), 'utf8')

  const dependents = styles.filter((r) => r[4] !== -1).length
  console.log(`csl/styles-index.json: ${styles.length} styles`)
  console.log(`  independent  ${styles.length - dependents}`)
  console.log(`  dependent    ${dependents} → ${parents.length} distinct parents`)
  console.log(`  short titles ${styles.filter((r) => r[2] !== 0).length}`)
  console.log(`  bytes        ${readFileSync(OUT).length}`)
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`)
    for (const w of warnings.slice(0, 20)) console.log(`  ${w}`)
    if (warnings.length > 20) console.log(`  … and ${warnings.length - 20} more`)
  }
}

/**
 * The upstream commit this index was built from, and its date — provenance, and
 * the only two values in the file that are not derived from the styles
 * themselves. Both come from upstream rather than from the clock, which is what
 * makes a rebuild of an unchanged catalogue byte-identical.
 *
 * Falls back to today only if the styles directory is not a git checkout (a
 * tarball extract, say), because a date is more useful than an empty string.
 */
function upstreamHead(repo) {
  try {
    const out = execFileSync(
      'git',
      ['-C', repo, 'log', '-1', '--format=%H %cd', '--date=format-local:%Y-%m-%d'],
      { encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } },
    ).trim()
    const [commit, date] = out.split(' ')
    if (commit && /^\d{4}-\d{2}-\d{2}$/.test(date)) return { commit, date }
  } catch {
    // not a git checkout
  }
  return { commit: '', date: new Date().toISOString().slice(0, 10) }
}

/** Pretty at the top, one line per style row. */
function serialize(index) {
  const { styles, parents, ...head } = index
  const lines = []
  lines.push('{')
  for (const [k, v] of Object.entries(head)) lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
  lines.push(`  "parents": ${JSON.stringify(parents)},`)
  lines.push('  "styles": [')
  styles.forEach((row, i) => {
    lines.push(`    ${JSON.stringify(row)}${i === styles.length - 1 ? '' : ','}`)
  })
  lines.push('  ]')
  lines.push('}')
  return lines.join('\n') + '\n'
}

main()
