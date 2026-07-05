# Task Breakdown
## OpenKB-for-Obsidian (Mastra Implementation) — MVP

> Each task should be atomic and independently testable/demoable — useful both for tracking and for structuring a build-in-public / vibe-coding video.

## Phase 0 — Project Setup
- [ ] Scaffold Mastra project (agents, workflows, TypeScript config)
- [ ] Create `raw/` and `wiki/` folder structure in a test project
- [ ] Seed initial `wiki/AGENTS.md` (wiki schema/instructions for the compilation agent)
- [ ] Add `CLAUDE.md` / AI rules file with project context and conventions

## Phase 1 — Raw Ingestion: Text Path
- [ ] Support dropping/writing a `.md`/text file directly into `raw/`
- [ ] Manual test: add a file to `raw/`, confirm it's recognized as a pending item

## Phase 2 — Raw Ingestion: Voice Path
- [ ] Implement Record/Stop capture (mic → local `.wav`)
- [ ] Add settings fields: STT Base URL, API Key, Model
- [ ] Implement STT client (OpenAI-compatible `/audio/transcriptions`)
- [ ] Write transcript into `raw/` as Markdown (same format/location as manual notes)
- [ ] Manual test: record → transcript appears in `raw/`, indistinguishable in format from a manual note

## Phase 3 — Folder Watcher (Mastra Workflow)
- [ ] Implement `watch` mode: detect new/changed files in `raw/`
- [ ] Implement explicit `add <file>` trigger for on-demand compilation
- [ ] Add settings toggle: `watchMode` (continuous vs. manual)
- [ ] Manual test: drop a file in `raw/` while watcher is running → compilation triggers automatically

## Phase 4 — Review & Approval Flow
- [ ] Add approval gate before compilation (applies to both voice and text sources equally)
- [ ] Add settings toggle: `requireApproval`
- [ ] Manual test: with approval required, confirm compilation waits; with it disabled, confirm auto-run

## Phase 5 — Compilation Agent: Summaries
- [ ] Implement Mastra agent step: generate a summary page per `raw/` document
- [ ] Write summary to `wiki/summaries/`
- [ ] Manual test: one `raw/` item → one corresponding summary page

## Phase 6 — Compilation Agent: Concepts & Entities
- [ ] Implement agent step: read existing `wiki/concepts/` and `wiki/entities/` for context
- [ ] Implement agent step: create/update concept pages (cross-document synthesis)
- [ ] Implement agent step: create/update entity pages (person/organization/place/product/work/event/other)
- [ ] Handle merge vs. duplicate: updating an existing concept/entity page instead of creating a new one
- [ ] Manual test: add two related documents → confirm the second updates (not duplicates) a concept/entity from the first

## Phase 7 — Index & Log Maintenance
- [ ] Implement agent step: update `wiki/index.md` (overview) after each compilation
- [ ] Implement agent step: append to `wiki/log.md` (operations timeline)
- [ ] Manual test: compile several documents in sequence → `index.md` and `log.md` reflect all of them

## Phase 8 — OKF & Obsidian Compatibility
- [ ] Ensure all generated wiki pages carry OKF-schema YAML frontmatter
- [ ] Ensure cross-references use `[[wikilinks]]` syntax
- [ ] Manual test: open `wiki/` as an Obsidian vault, confirm graph view shows expected links

## Phase 9 — Settings & Configuration Polish
- [ ] Build settings UI/config file (LLM/STT config, folder paths, approval + watch toggles, entity types)
- [ ] Validate config (test-connection check for LLM/STT endpoints)

## Phase 10 — End-to-End Polish
- [ ] Error handling for failed STT/LLM calls and watcher crashes (no double-compilation on restart)
- [ ] Basic lint-equivalent check: structural + knowledge consistency report under `wiki/reports/`
- [ ] Docs: README covering setup, `raw/` conventions, and self-hosted vs. cloud provider config

## Stretch Goals (post-MVP, parity with upstream OpenKB)
- [ ] Non-Markdown raw inputs: PDF, Word, PPT, Excel, HTML, URLs
- [ ] Long-document handling (PageIndex-style tree indexing)
- [ ] Query/Chat generator over the compiled wiki
- [ ] Skill Factory (distill a redistributable agent skill from the wiki)
- [ ] Mobile support
