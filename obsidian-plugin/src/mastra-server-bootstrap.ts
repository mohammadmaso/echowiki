import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, rmSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

export const PLUGIN_GITHUB_REPO = 'mohammadmaso/echowiki';
export const MASTRA_SERVER_ARCHIVE = 'mastra-server.tar.gz';

export function mastraServerEntry(pluginDir: string): string {
  return join(pluginDir, 'mastra-server', 'index.mjs');
}

export function isMastraServerInstalled(pluginDir: string): boolean {
  return existsSync(mastraServerEntry(pluginDir));
}

function releaseAssetUrl(version: string): string {
  return `https://github.com/${PLUGIN_GITHUB_REPO}/releases/download/${version}/${MASTRA_SERVER_ARCHIVE}`;
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download Mastra server (${response.status}) from ${url}`);
  }

  await pipeline(Readable.fromWeb(response.body as ReadableStream<Uint8Array>), createWriteStream(destination));
}

async function extractTarGz(archivePath: string, destinationDir: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('tar', ['-xzf', archivePath, '-C', destinationDir], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-2000);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `tar exited with code ${code ?? 'unknown'}`));
    });
  });
}

export async function ensureMastraServerInstalled(pluginDir: string, version: string): Promise<void> {
  if (isMastraServerInstalled(pluginDir)) {
    return;
  }

  await mkdir(pluginDir, { recursive: true });

  const archivePath = join(pluginDir, MASTRA_SERVER_ARCHIVE);
  const url = releaseAssetUrl(version);

  try {
    await downloadFile(url, archivePath);
    await extractTarGz(archivePath, pluginDir);
  } finally {
    await rm(archivePath, { force: true });
  }

  if (!isMastraServerInstalled(pluginDir)) {
    throw new Error('Mastra server archive extracted but index.mjs is missing.');
  }
}

export async function reinstallMastraServer(pluginDir: string, version: string): Promise<void> {
  await rm(join(pluginDir, 'mastra-server'), { recursive: true, force: true });
  await ensureMastraServerInstalled(pluginDir, version);
}
