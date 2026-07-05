# Product Requirements Document (PRD)
## OpenKB-for-Obsidian (Mastra Implementation)

> **Scope note**: This project is a full reimplementation of [VectifyAI/OpenKB](https://github.com/VectifyAI/OpenKB) — an open-source LLM Knowledge Base compiler — built on the **Mastra** agent framework (TypeScript/Node) instead of OpenKB's original Python stack (OpenAI Agents SDK + LiteLLM). Voice capture is one input path among several, not the whole product.

### 1. Problem Statement
Knowledge capture happens through many channels — spoken thoughts, quick notes, pasted articles, existing Markdown files — but each channel usually stays siloed as a raw, unstructured file. Traditional RAG re-derives understanding from scratch on every query; nothing accumulates, and cross-references between documents don't exist unless a human builds them by hand.

### 2. Vision
A **local-first, LLM-powered knowledge compiler** that watches a single `raw/` folder for anything dropped into it — voice recordings, Markdown notes, pasted text — and continuously compiles it into a structured, interlinked wiki: summaries, concept pages, entity pages, and cross-links, kept in sync as new material arrives. The wiki lives as plain Markdown with `[[wikilinks]]`, so it opens natively in Obsidian for graph browsing, and its frontmatter follows Google's **Open Knowledge Format (OKF)** for portability.

### 3. Target User
- Obsidian users who want an LLM-compiled "second brain" instead of a pile of raw notes.
- Developers/knowledge workers comfortable running a local watcher process against a folder.
- Users who capture knowledge through **multiple modalities** (voice + text) and want it unified in one compiled wiki, not two separate systems.

### 4. Core Concept: the `raw/` Folder
`raw/` is the single entry point for all knowledge capture, regardless of source:

| Source | How it lands in `raw/` |
|---|---|
| **Voice recording** | User presses Record → audio captured → transcribed via STT → transcript written into `raw/` as Markdown |
| **Manual Markdown/text notes** | User drops or writes `.md`/text files directly into `raw/` |
| **(Future) other formats** | PDF, Word, HTML, URLs, etc. — as in upstream OpenKB, via a format-conversion step before compilation |

A background watcher (`watch` mode) or an explicit `add` action detects anything new in `raw/` and runs it through the compilation pipeline. **All of `raw/` is compiled** — not just voice transcripts.

### 5. Core User Flow (MVP)

**Path A — Voice:**
1. Press **Record** → speak → stop.
2. Audio saved locally; transcribed via configurable STT into a Markdown transcript.
3. Transcript written into `raw/`.
4. (Optional) user reviews/edits before compilation, per the `requireApproval` setting.
5. Compilation agent picks it up (on save, or on next `watch`/`add` cycle).

**Path B — Text:**
1. User creates or drops a Markdown/text file into `raw/` directly (writing a note, pasting an article, etc.).
2. Same compilation pipeline picks it up — no distinction from a voice-derived transcript once it's in `raw/`.

**Compilation (shared by both paths):**
1. Agent generates a **summary** page for the new document.
2. Agent reads existing **concept** and **entity** pages for context.
3. Agent creates/updates **concept pages** (cross-document synthesis).
4. Agent creates/updates **entity pages** (people, orgs, places, products, etc.).
5. Agent updates `index.md` (overview) and `log.md` (operations timeline).
6. All output is written as OKF-frontmatter Markdown with `[[wikilinks]]` into the wiki folder, viewable in Obsidian.

### 6. In-Scope Features (MVP)
| Feature | Description |
|---|---|
| `raw/` folder ingestion | Single folder accepts both transcribed voice and manually authored/dropped Markdown |
| Voice capture | Record button, local audio storage, STT transcription into `raw/` |
| Folder watcher | Detect new/changed files in `raw/` and trigger compilation (`watch` equivalent) |
| Manual add | Explicit "compile now" action for a specific file (`add` equivalent) |
| Review/approval gate | Optional manual review before a `raw/` item is compiled (toggle in settings) |
| Wiki compilation agent (Mastra) | Summary → concepts → entities → index/log update, per OpenKB's compilation model |
| OKF-compliant frontmatter | All wiki pages carry Google OKF-schema YAML frontmatter |
| Obsidian compatibility | Wiki is plain `.md` + `[[wikilinks]]`, opens directly as an Obsidian vault |
| Provider-agnostic LLM/STT config | Any OpenAI-compatible LLM and STT endpoint, cloud or self-hosted |

### 7. Out of Scope (MVP)
- Long-document handling via PageIndex-style tree indexing (upstream OpenKB feature) — MVP assumes short/medium documents read in full by the LLM.
- Non-Markdown/non-text raw inputs (PDF, Word, PPT, Excel, URLs) — stretch goal, matching upstream OpenKB's broader format support.
- Query/Chat generators and Skill Factory (upstream OpenKB "Layer 2") — MVP is the **wiki foundation** (compile + maintain) only.
- Multi-user/team knowledge graphs.
- Mobile support.

### 8. Design Principles
- **Single ingestion point**: everything — voice or text — funnels through `raw/`.
- Local-first storage; external calls only for STT/LLM steps.
- Human review before compilation is optional, not mandatory (toggleable).
- Knowledge **compounds**: each new document enriches existing concept/entity pages rather than sitting in isolation.
- Standards-based representation: OKF frontmatter, Obsidian-native Markdown/wikilinks.
- Fully provider-agnostic AI configuration (LLM and STT).
- Architecturally faithful to OpenKB's wiki model, reimplemented on Mastra instead of OpenAI Agents SDK/LiteLLM.

### 9. Success Metrics (suggested)
- Time from "file lands in `raw/`" to "wiki updated" (compilation latency).
- % of `raw/` items compiled without requiring manual correction to concept/entity pages.
- Wiki health as measured by a `lint`-equivalent check (structural + knowledge consistency).

### 10. Open Questions
- Which non-Markdown formats (if any) does MVP need to accept in `raw/` beyond voice-transcript Markdown and manually authored Markdown?
- Should the `watch` process run continuously as a background service, or be triggered manually per session?
- How closely should the wiki folder structure mirror upstream OpenKB (`wiki/index.md`, `wiki/log.md`, `wiki/AGENTS.md`, `wiki/sources/`, `wiki/summaries/`, `wiki/concepts/`, `wiki/entities/`, `wiki/explorations/`, `wiki/reports/`) vs. a simplified subset for MVP?
- Is Query/Chat (Layer 2) needed for a "done" MVP, or is the compiled wiki itself the deliverable, with Obsidian as the browsing/query surface?
