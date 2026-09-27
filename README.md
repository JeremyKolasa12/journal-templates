# journal-templates

An open, community-maintained catalog of **journal submission templates** for the
Vera Vulpes research app (and anyone else who wants to consume them). Each
template describes a journal's submission requirements — word/reference limits,
required sections, and citation style — as a small JSON file.

The app fetches this catalog over the jsDelivr CDN and lets users download a
template into their library, which then scaffolds their manuscript's sections and
checks it against the journal's limits.

> ⚠️ Limits change and vary by article type. Treat every template as a **starting
> point** and verify against the journal's current author guidelines. Each
> template should link its `guidelinesUrl`.

## Layout

```
index.json            # manifest: [{ id, name, publisher?, file }]
templates/<id>.json   # one file per journal
schema.json           # JSON Schema for a template (editor IntelliSense + docs)
validate.mjs          # dependency-free CI validation
csl/                  # the CSL style index (generated -- see below)
```

## Template format

```jsonc
{
  "schemaVersion": 1,
  "name": "Nature (Article)",
  "publisher": "Springer Nature",
  "citationStyle": "nature",          // apa | vancouver | ieee | nature
  "wordsPerPage": 900,                 // page ESTIMATE only
  "guidelinesUrl": "https://…",
  "limits": {
    "abstractWords": 150,
    "mainTextWords": null,             // null = no limit
    "references": 50,
    "figures": null
  },
  "requiredSections": ["Abstract", "Introduction", "Results", "Discussion", "Methods", "References"]
}
```

## Contributing a journal

You only add **one file** — `index.json` is generated automatically.

1. Add `templates/<your-id>.json` (see the format above; `id` = kebab-case).
   The easiest way: build the template in the Vera Vulpes app and click
   **Contribute**, which opens a prefilled pull request.
2. (Optional) Run `node generate-index.mjs && node validate.mjs` locally.
3. Open a pull request. Cite the journal's author-guidelines page in the PR.

CI regenerates `index.json` from `templates/*.json` and validates every file; on
merge to `master` the refreshed `index.json` is committed automatically.

## The CSL style index (`csl/`)

A **generated** catalogue of every citation style in
[citation-style-language/styles](https://github.com/citation-style-language/styles) --
about 10,900 of them -- so an app can let a writer search for their journal by
name. Do not hand-edit it.

It exists because the CSL repo ships no manifest, and the titles are only inside
the files. jsDelivr can list the repo's *filenames*, but a filename is a slug:
nobody looking for JAMA types `american-medical-association`.

```
csl/styles-index.json         # the index (generated; one style per line)
csl/build-style-index.mjs     # rebuild it from a clone of the styles repo
csl/validate-style-index.mjs  # structural checks + a count floor
```

Each row is `[id, title, shortTitle | 0, formatIdx, parentIdx]`, where
`formatIdx` indexes the `formats` array in the same file (`-1` = the style
declares none, so it inherits its parent's) and `parentIdx` indexes `parents`
(`-1` = an independent style). `shortTitle` is the style's `<title-short>` --
the abbreviation people actually search by -- or `0` when it has none.

To rebuild locally:

```sh
git clone --depth 1 https://github.com/citation-style-language/styles.git /tmp/csl-styles
node csl/build-style-index.mjs --styles /tmp/csl-styles
node csl/validate-style-index.mjs
```

### Consuming it

Fetch it from a **dated tag**, never from the branch:

```
https://cdn.jsdelivr.net/gh/JeremyKolasa12/journal-templates@csl-<date>/csl/styles-index.json
```

A tagged URL is immutable, so it is safe to cache hard and a returning reader
pays nothing for it. Measured against the live CDN: `public, max-age=604800,
s-maxage=43200` — a week in the browser, twelve hours at the edge. Tags are never
moved; a second build on the same day gets its own suffix. The `csl-index`
workflow rebuilds weekly and tags only when the index actually changed, printing
the new URL in its run summary.

`generated` is the **upstream commit's** date, not the build date, and `v`, the
`formats` list and the row order are all fixed -- so rebuilding an unchanged
catalogue produces a byte-identical file and CI has nothing to commit. Without
that, a weekly rebuild would publish a new tag every Monday holding exactly the
same 10,900 styles.

Full titles are kept even though 84% of ids would reproduce a lower-cased version
of their title. Reconstructing a title from its id needs a capitalisation rule,
and no rule recovers `PLOS ONE` or `AAPS PharmSciTech` from their slugs. Measured
locally at maximum brotli, omitting the reconstructable titles saved 33 KB out of
171 KB — and a rule that has to stay byte-identical between this repo and every
consumer, forever, or journal names silently go wrong, is not worth 33 KB of a
file fetched once.

Those are compression-ratio figures, not transfer sizes: jsDelivr compresses for
speed rather than for size, and serves the real file at **215 KB brotli** (219 KB
gzip, 968 KB raw).

Contributions are licensed **CC0-1.0** (public domain) so anyone can use them
freely. The style index is derived from the CSL styles repo, which is itself
CC-BY-SA; the styles' own metadata remains theirs.
