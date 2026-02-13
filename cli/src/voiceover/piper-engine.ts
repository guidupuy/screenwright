import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getPiperBinPath, getVoiceModelPath } from './voice-models.js';

const execFileAsync = promisify(execFile);

export interface SynthesizeResult {
  wavPath: string;
  durationMs: number;
}

export async function synthesize(
  text: string,
  outputPath: string,
  modelPath?: string,
): Promise<SynthesizeResult> {
  const piperBin = getPiperBinPath();
  const model = modelPath ?? getVoiceModelPath('en_US-amy-medium');

  return new Promise((resolve, reject) => {
    const proc = spawn(piperBin, [
      '--model', model,
      '--output_file', outputPath,
    ]);

    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data; });

    proc.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}: ${stderr}`));
        return;
      }

      const durationMs = await measureDuration(outputPath);
      resolve({ wavPath: outputPath, durationMs });
    });

    proc.stdin.write(text);
    proc.stdin.end();
  });
}

async function measureDuration(wavPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      wavPath,
    ]);
    return Math.round(parseFloat(stdout.trim()) * 1000);
  } catch {
    // Fallback: estimate from file size (16kHz 16-bit mono WAV)
    const { stat } = await import('node:fs/promises');
    const stats = await stat(wavPath);
    const dataBytes = stats.size - 44; // WAV header
    const samplesPerSec = 22050;
    const bytesPerSample = 2;
    return Math.round((dataBytes / (samplesPerSec * bytesPerSample)) * 1000);
  }
}
