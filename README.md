# EchoWiki

Local-first LLM knowledge compiler for Obsidian. Drop notes or record voice into `raw/`; the Mastra wiki compiler agent turns them into a structured, interlinked wiki under `wiki/`.

Repository: [github.com/mohammadmaso/echowiki](https://github.com/mohammadmaso/echowiki)

## Quick start (Obsidian vault)

EchoWiki is designed so the **repo root is your Obsidian vault**. Your personal notes (`raw/`, `wiki/`) stay local and are not committed to git.

### 1. Clone and install

```shell
git clone https://github.com/mohammadmaso/echowiki.git
cd echowiki
nvm use          # Node.js >= 22.13 (see .nvmrc)
npm install
npm run build:plugin
```

This builds the Mastra server and the Obsidian plugin (`obsidian-plugin/main.js` + bundled `mastra-server/`).

### 2. Open as an Obsidian vault

1. In Obsidian, choose **Open folder as vault**.
2. Select the cloned `echowiki` folder (the repo root).
3. Obsidian creates `.obsidian/` locally (gitignored — your settings stay private).

On first plugin load, EchoWiki creates empty `raw/` and `wiki/` folders with the expected subfolders.

Optional: copy the starter compiler instructions into your wiki:

```shell
cp templates/wiki/AGENTS.md wiki/AGENTS.md
```

### 3. Install the plugin in the vault

Symlink or copy the built plugin into Obsidian’s plugin directory:

```shell
mkdir -p .obsidian/plugins/echowiki
cp obsidian-plugin/manifest.json obsidian-plugin/styles.css obsidian-plugin/main.js .obsidian/plugins/echowiki/
cp -R obsidian-plugin/mastra-server .obsidian/plugins/echowiki/
```

Then in Obsidian:

1. **Settings → Community plugins → Turn on community plugins**
2. Enable **EchoWiki**

The status bar should show `EchoWiki: ready :4111` when the embedded Mastra server is running.

### 4. Configure API keys

**Settings → EchoWiki**:

| Setting | Purpose |
|---------|---------|
| LLM API key / model / base URL | Text compilation (any OpenAI-compatible endpoint) |
| STT base URL / API key / model | Voice transcription (`/audio/transcriptions`) |
| Language | Compilation output language (e.g. `en`, `fa`) |
| Watch mode | Auto-compile when files change under `raw/` |
| Require approval | Queue new raw files until you approve them |

API keys are stored only in `.obsidian/plugins/echowiki/data.json` on your machine (never committed).

### 5. Daily use

| Action | How |
|--------|-----|
| Drop a note for compilation | Save a `.md` or `.txt` file in `raw/`, or use **EchoWiki: Send active note to raw/** |
| Record a voice note | Ribbon mic icon, or **EchoWiki: Record voice note** |
| Compile one file | Open a file under `raw/`, run **EchoWiki: Compile active raw file** |
| Approve queued files | **EchoWiki: Review pending compilations** (when require approval is on) |
| Browse results | Open `wiki/index.md`, graph view on `wiki/`, follow `[[wikilinks]]` |

Compilation writes to `wiki/summaries/`, updates `wiki/concepts/` and `wiki/entities/`, and refreshes `wiki/index.md` and `wiki/log.md`.

## Vault layout

Open the **project root** as your Obsidian vault. It must contain sibling folders:

```text
<vault>/
├── raw/          # incoming notes and voice transcripts
└── wiki/         # compiled summaries, concepts, entities, index, log
```

## Obsidian plugin (recommended)

The desktop plugin bundles and manages the Mastra server — you do **not** need to run `npm run dev` separately for day-to-day use.

### Requirements

- Obsidian desktop (plugin sets `isDesktopOnly`)
- Node.js **≥ 22.13** available on your PATH (or configure a custom path in settings)

### Build and install

From the repo root:

```shell
npm run build
cd obsidian-plugin
npm install
npm run build:mastra-server
npm run build
```

Copy or symlink the plugin folder into your vault:

```text
<vault>/.obsidian/plugins/echowiki/
├── main.js
├── manifest.json
├── styles.css
└── mastra-server/    # bundled Mastra output (from build:mastra-server)
```

Enable **EchoWiki** in Obsidian → Settings → Community plugins.

### Plugin settings

Configure in Obsidian → Settings → EchoWiki:

| Setting | Purpose |
|---------|---------|
| LLM API key / model / base URL | Passed to the embedded Mastra server |
| STT base URL / API key / model | Voice transcription (`/audio/transcriptions`) |
| Watch mode | Auto-detect new/changed files in `raw/` |
| Require approval | Hold raw files in a pending queue until approved |

The Mastra server starts automatically when the plugin loads. Status appears in the status bar (`EchoWiki: ready :4111`).

### Commands

- **EchoWiki: Record voice note** — mic → STT → `raw/<timestamp>.transcript.md`
- **EchoWiki: Send active note to raw/** — copy current note into `raw/`
- **EchoWiki: Compile active raw file** — run compilation on the open raw note
- **EchoWiki: Review pending compilations** — approve or reject queued raw files

Ribbon: microphone icon opens the voice recorder.

## Mastra development (optional)

For agent/workflow development and [Mastra Studio](https://mastra.ai/docs/studio/overview):

```shell
npm run dev
```

Open [http://localhost:4111](http://localhost:4111) to inspect agents, workflows, and traces.

After changing `src/mastra` or `src/wiki`, rebuild the bundled server used by the plugin:

```shell
npm run build
cd obsidian-plugin && npm run build:mastra-server
```

## Manual test checklist

1. **Text path:** Create a note → *Send active note to raw/* → file appears in `raw/` → *Compile active raw file* → `wiki/summaries/<name>.md` is created.
2. **Voice path:** *Record voice note* → transcript `.md` appears in `raw/` with the same pipeline as manual notes.
3. **Watcher:** With watch mode on, save a file under `raw/` → compilation triggers (or approval prompt if enabled).
4. **Approval:** With require approval on, compilation waits until you approve in *Review pending compilations*; with it off, compile runs immediately.
5. **Obsidian graph:** Open graph view on `wiki/` and confirm new pages link via `[[wikilinks]]`.

## Environment variables (Mastra server)

When running via CLI (`npm run dev` / `npm run start`) or when spawned by the plugin:

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | LLM provider key |
| `LLM_MODEL` | Model id (default `openai/gpt-5-mini`) |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible base URL |
| `MASTRA_DB_PATH` | LibSQL database path (plugin stores this under its data folder) |
| `PORT` | Server port (default `4111`) |

See [`.env.example`](.env.example) for a minimal CLI setup.

## Project structure

```text
src/
├── mastra/           # Mastra agents, workflows, tools
└── wiki/             # Compilation pipeline (summaries, concepts, entities)
obsidian-plugin/      # Obsidian desktop plugin
raw/                  # Universal ingestion folder
wiki/                 # Compiled Obsidian-compatible wiki output
```

## Learn more

- [Mastra documentation](https://mastra.ai/docs/)
- Product/tech context: [`.ai/01-PRD.md`](.ai/01-PRD.md), [`.ai/02-TECH-SPEC.md`](.ai/02-TECH-SPEC.md)
- Task breakdown: [`.ai/03-TASKS.md`](.ai/03-TASKS.md)
