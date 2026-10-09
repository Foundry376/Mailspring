import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';

/**
 * The downloadable model for on-device extraction (Qwen3.5-0.8B). It is downloaded on demand, never shipped in the installer, and its bytes are pinned:
 * a file whose size or SHA-256 differs is never loaded.
 */
export interface ModelSpec {
  id: string;
  /** Shown to people, e.g. in the Views home badge. */
  label: string;
  fileName: string;
  url: string;
  size: number;
  sha256: string;
}

export const EXTRACTION_MODEL: ModelSpec = {
  id: 'qwen3.5-0.8b-q4km',
  label: 'Qwen 3.5 (0.8B)',
  fileName: 'qwen3.5-0.8b-q4km.gguf',
  url: 'https://huggingface.co/bartowski/Qwen_Qwen3.5-0.8B-GGUF/resolve/main/Qwen_Qwen3.5-0.8B-Q4_K_M.gguf',
  size: 579615840,
  sha256: 'fb044e93939a70469c905781334f5de1e6c8b608ced6cbc8c9249bd4127d9526',
};

/** Part of every cache key, so changing the pinned model invalidates old results. */
export const EXTRACTION_MODEL_VERSION = `${EXTRACTION_MODEL.id}@${EXTRACTION_MODEL.sha256.slice(
  0,
  12
)}`;

/** One cached answer per (message, schema, model); bodies never change, so this never expires. */
export function cacheKey(messageId: string, schemaHash: string, modelVersion: string) {
  return crypto
    .createHash('sha256')
    .update(`${messageId}\u0000${schemaHash}\u0000${modelVersion}`)
    .digest('hex');
}

export function modelDir(configDirPath: string) {
  return path.join(configDirPath, 'models');
}

export function downloadedModelPath(configDirPath: string, spec: ModelSpec = EXTRACTION_MODEL) {
  return path.join(modelDir(configDirPath), spec.fileName);
}

export function partialModelPath(configDirPath: string, spec: ModelSpec = EXTRACTION_MODEL) {
  return `${downloadedModelPath(configDirPath, spec)}.partial`;
}

/**
 * The model file to load, or null if none is available. `overridePath` (the
 * `core.views.extractionModelPath` setting) lets development point at a local copy without
 * downloading; it is still size-checked so a wrong file fails here rather than in llama.cpp.
 */
export function resolveModelPath(configDirPath: string, overridePath?: string): string | null {
  for (const candidate of [overridePath, downloadedModelPath(configDirPath)]) {
    if (!candidate) continue;
    try {
      if (fs.statSync(candidate).size === EXTRACTION_MODEL.size) return candidate;
    } catch (err) {
      // missing; try the next candidate
    }
  }
  return null;
}

export async function sha256OfFile(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve())
      .on('error', reject);
  });
  return hash.digest('hex');
}

function get(
  url: string,
  headers: { [key: string]: string },
  signal: AbortSignal | undefined,
  redirects = 0
) {
  return new Promise<import('http').IncomingMessage>((resolve, reject) => {
    // http: is only reachable through a test ModelSpec; the pinned model is https.
    const transport = url.startsWith('http:') ? http : https;
    transport
      .get(url, { headers, signal }, (res) => {
        const location = res.headers.location;
        if (res.statusCode >= 300 && res.statusCode < 400 && location && redirects < 5) {
          res.resume();
          resolve(get(new URL(location, url).toString(), headers, signal, redirects + 1));
          return;
        }
        resolve(res);
      })
      .on('error', reject);
  });
}

/**
 * Downloads the pinned model into `<configDir>/models/`. Bytes go to a `.partial` file and a
 * restarted download resumes from its length with an HTTP Range request. The file is renamed
 * into place only after its SHA-256 matches the pin.
 */
export async function downloadModel(
  configDirPath: string,
  onProgress: (p: { received: number; total: number }) => void,
  { spec = EXTRACTION_MODEL, signal }: { spec?: ModelSpec; signal?: AbortSignal } = {}
): Promise<string> {
  const finalPath = downloadedModelPath(configDirPath, spec);
  const partialPath = partialModelPath(configDirPath, spec);
  fs.mkdirSync(modelDir(configDirPath), { recursive: true });

  let offset = 0;
  try {
    offset = fs.statSync(partialPath).size;
  } catch (err) {
    offset = 0;
  }
  if (offset > spec.size) {
    fs.unlinkSync(partialPath);
    offset = 0;
  }

  if (offset < spec.size) {
    const res = await get(spec.url, offset ? { Range: `bytes=${offset}-` } : {}, signal);
    if (res.statusCode === 200 && offset > 0) {
      // The server ignored the Range header; start over rather than append a second copy.
      offset = 0;
    } else if (res.statusCode !== 200 && res.statusCode !== 206) {
      res.resume();
      throw new Error(`Model download failed with HTTP ${res.statusCode}`);
    }
    const out = fs.createWriteStream(partialPath, { flags: offset ? 'a' : 'w' });
    let received = offset;
    await new Promise<void>((resolve, reject) => {
      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        onProgress({ received, total: spec.size });
      });
      res.on('error', reject);
      res.on('aborted', () => reject(new Error('Model download was interrupted.')));
      out.on('error', reject);
      out.on('finish', () => resolve());
      res.pipe(out);
    });
  }

  if (signal && signal.aborted) throw new Error('Model download was cancelled.');
  const actual = await sha256OfFile(partialPath);
  if (actual !== spec.sha256) {
    fs.unlinkSync(partialPath);
    throw new Error('Downloaded model failed its integrity check and was deleted.');
  }
  fs.renameSync(partialPath, finalPath);
  return finalPath;
}
