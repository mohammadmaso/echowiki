import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import {
  Observability,
  MastraStorageExporter,
  MastraPlatformExporter,
  SensitiveDataFilter,
} from '@mastra/observability';
import { wikiCompilerAgent } from './agents/wiki-compiler';
import { compileDocumentWorkflow } from './workflows/compile-document';

// LibSQL handles all storage domains (including observability) in one file.
// DuckDB was removed here because its file lock breaks `mastra dev` hot reload
// when a previous Node process still holds mastra.duckdb open.
export const mastra = new Mastra({
  agents: { wikiCompilerAgent },
  workflows: { compileDocumentWorkflow },
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: process.env.MASTRA_DB_PATH
      ? `file:${process.env.MASTRA_DB_PATH}`
      : 'file:./mastra.db',
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new MastraStorageExporter(),
          new MastraPlatformExporter(),
        ],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
