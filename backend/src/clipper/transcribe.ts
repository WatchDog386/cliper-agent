import { env } from '../config/env';
import { run } from '../lib/tools';
import type { Word } from './edit';

/*
 * Speech to text for auto captions and smart cuts. Runs WHISPER_CMD (by default the bundled
 * scripts/transcribe.py with faster-whisper on the CPU). Without it, everything else in auto-edit
 * still works and captions are skipped.
 */

export const transcriberConfigured = () => Boolean(env.WHISPER_CMD.trim());

/** Split "python3 /app/scripts/transcribe.py" into program + arguments (quotes are not needed). */
const command = () => {
  const [cmd, ...args] = env.WHISPER_CMD.trim().split(/\s+/);
  return { cmd: cmd!, args };
};

export async function transcribe(file: string, onProgress: (f: number) => void, signal?: AbortSignal, language?: string): Promise<{ language: string; words: Word[] } | null> {
  if (!transcriberConfigured()) return null;
  const { cmd, args } = command();
  const out = await run(cmd, [...args, file, env.WHISPER_MODEL, language ?? ''], {
    signal,
    onStderr: (l) => {
      const m = /^PROGRESS\s+([\d.]+)/.exec(l);
      if (m) onProgress(Number(m[1]));
    },
  });
  const json = JSON.parse(out.slice(out.indexOf('{'))) as { language: string; words: { s: number; e: number; w: string }[] };
  return { language: json.language, words: json.words.map((w) => ({ start: w.s, end: w.e, text: w.w })) };
}

/** Whether the transcriber can run (Settings → Server): its Python can import faster-whisper. */
export async function transcriberStatus() {
  if (!transcriberConfigured()) return { ok: false, version: 'off (set WHISPER_CMD)' };
  const { cmd } = command();
  try {
    const v = await run(cmd, ['-c', 'import faster_whisper; print(faster_whisper.__version__)']);
    return { ok: true, version: `faster-whisper ${v.trim()} · ${env.WHISPER_MODEL}` };
  } catch {
    return { ok: false, version: 'faster-whisper not installed' };
  }
}
