export async function transcribeAudio(
  baseUrl: string,
  apiKey: string,
  model: string,
  audio: Blob,
  filename: string,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/audio/transcriptions`;
  const form = new FormData();
  form.append('file', audio, filename);
  form.append('model', model);

  const headers: Record<string, string> = {};
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`STT failed (${response.status}): ${text.slice(0, 500)}`);
  }

  const payload = (await response.json()) as { text?: string };
  if (!payload.text?.trim()) {
    throw new Error('STT returned empty transcript');
  }
  return payload.text.trim();
}

export async function testSttConnection(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const silentWav = createSilentWavBlob(1000);
  return transcribeAudio(baseUrl, apiKey, model, silentWav, 'test.wav');
}

function createSilentWavBlob(durationMs: number): Blob {
  const sampleRate = 16_000;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  return new Blob([buffer], { type: 'audio/wav' });
}
