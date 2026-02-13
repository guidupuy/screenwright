import { mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PIPER_GITHUB = 'https://github.com/rhasspy/piper/releases/download';
const PIPER_VERSION = '2023.11.14-2';

const VOICE_BASE_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0';

export interface VoiceModel {
  name: string;
  onnxUrl: string;
  configUrl: string;
}

export const DEFAULT_VOICE: VoiceModel = {
  name: 'en_US-amy-medium',
  onnxUrl: `${VOICE_BASE_URL}/en/en_US/amy/medium/en_US-amy-medium.onnx`,
  configUrl: `${VOICE_BASE_URL}/en/en_US/amy/medium/en_US-amy-medium.onnx.json`,
};

export function getScreenwrightDir(): string {
  return join(homedir(), '.screenwright');
}

export function getPiperBinPath(): string {
  return join(getScreenwrightDir(), 'bin', 'piper');
}

export function getVoiceModelPath(modelName: string): string {
  return join(getScreenwrightDir(), 'voices', `${modelName}.onnx`);
}

export function getVoiceConfigPath(modelName: string): string {
  return join(getScreenwrightDir(), 'voices', `${modelName}.onnx.json`);
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function getPiperDownloadUrl(): string {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin') {
    return `${PIPER_GITHUB}/${PIPER_VERSION}/piper_macos_${arch === 'arm64' ? 'aarch64' : 'x64'}.tar.gz`;
  }
  if (platform === 'linux') {
    return `${PIPER_GITHUB}/${PIPER_VERSION}/piper_linux_${arch === 'arm64' ? 'aarch64' : 'x86_64'}.tar.gz`;
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

export async function downloadPiper(): Promise<string> {
  const binPath = getPiperBinPath();
  if (await exists(binPath)) return binPath;

  const binDir = join(getScreenwrightDir(), 'bin');
  await mkdir(binDir, { recursive: true });

  const url = getPiperDownloadUrl();
  console.log(`Downloading Piper from ${url}...`);

  await execFileAsync('bash', ['-c', `
    curl -sL "${url}" | tar xz -C "${binDir}" --strip-components=1
  `]);

  // Make executable
  await execFileAsync('chmod', ['+x', binPath]);

  console.log('Piper installed successfully.');
  return binPath;
}

export async function downloadVoiceModel(model: VoiceModel = DEFAULT_VOICE): Promise<string> {
  const modelPath = getVoiceModelPath(model.name);
  const configPath = getVoiceConfigPath(model.name);

  if (await exists(modelPath) && await exists(configPath)) return modelPath;

  const voicesDir = join(getScreenwrightDir(), 'voices');
  await mkdir(voicesDir, { recursive: true });

  console.log(`Downloading voice model: ${model.name}...`);

  await execFileAsync('curl', ['-sL', '-o', modelPath, model.onnxUrl]);
  await execFileAsync('curl', ['-sL', '-o', configPath, model.configUrl]);

  console.log('Voice model downloaded.');
  return modelPath;
}

export async function ensureDependencies(modelName = 'en_US-amy-medium'): Promise<{
  piperBin: string;
  modelPath: string;
}> {
  const piperBin = await downloadPiper();
  const model = modelName === DEFAULT_VOICE.name ? DEFAULT_VOICE : {
    name: modelName,
    onnxUrl: `${VOICE_BASE_URL}/en/en_US/${modelName.split('-')[1]}/${modelName.split('-')[2]}/${modelName}.onnx`,
    configUrl: `${VOICE_BASE_URL}/en/en_US/${modelName.split('-')[1]}/${modelName.split('-')[2]}/${modelName}.onnx.json`,
  };
  const modelPath = await downloadVoiceModel(model);
  return { piperBin, modelPath };
}
