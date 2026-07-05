# Wiki Compilation Instructions

This file is the runtime instruction manual for the Wiki Compiler agent. Edit it to change how EchoWiki organizes and maintains the compiled wiki — changes take effect on the next compilation run without redeploying code.

## Wiki structure

```
wiki/
├── index.md          # Knowledge base overview
├── log.md            # Operations timeline
├── AGENTS.md         # This file — compilation conventions
├── sources/          # Full-text conversions of raw/ inputs
├── summaries/        # One summary page per raw/ document
├── concepts/         # Cross-document synthesis pages
├── entities/         # Named things (people, orgs, places, products, …)
├── explorations/     # Saved query results (stretch goal)
└── reports/          # Lint / health reports
```

## Compilation steps (per new raw/ document)

1. Generate a **summary** page in `summaries/`.
2. Read existing pages in `concepts/` and `entities/` for context.
3. Create or **update** concept pages — cross-document synthesis, not one-off notes.
4. Create or **update** entity pages using these types: person, organization, place, product, work, event, other.
5. Update `index.md` and append to `log.md`.

## Output conventions

- Every generated page must include OKF-schema YAML frontmatter.
- Cross-references use Obsidian `[[wikilinks]]`.
- Do not silently overwrite manually edited wiki pages — surface conflicts instead.
- Treat all raw/ inputs identically regardless of source (voice transcript or manual note).
