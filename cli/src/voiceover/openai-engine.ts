import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { OpenaiVoice } from '../config/config-schema.js';

const execFileAsync = promisify(execFile);

export interface SynthesizeResult {
  audioPath: string;
  durationMs: number;
}

export async function synthesize(
  text: string,
  outputPath: string,
  voice: OpenaiVoice = 'nova',
): Promise<SynthesizeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY environment variable is required for OpenAI TTS. ' +
      'Set it with: export OPENAI_API_KEY=sk-...',
    );
  }

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      input: text,
      voice,
      response_format: 'mp3',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI TTS API error (${res.status}): ${body}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(outputPath, buffer);

  const durationMs = await measureDuration(outputPath);
  return { audioPath: outputPath, durationMs };
}

async function measureDuration(path: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      path,
    ]);
    return Math.round(parseFloat(stdout.trim()) * 1000);
  } catch {
    // Fallback: rough estimate from mp3 file size (~128kbps)
    const { stat } = await import('node:fs/promises');
    const stats = await stat(path);
    return Math.round((stats.size * 8) / 128000 * 1000);
  }
}
