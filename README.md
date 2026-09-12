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

1. Add `templates/<your-id>.json` (see the format above; `id` = kebab-case).
2. Add an entry to `index.json` pointing at it.
3. Run `node validate.mjs` locally (CI runs it on every PR).
4. Open a pull request. Cite the journal's author-guidelines page in the PR.

Contributions are licensed **CC0-1.0** (public domain) so anyone can use them
freely.
