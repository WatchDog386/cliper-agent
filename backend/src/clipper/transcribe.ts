import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { run, tools } from '../lib/tools';
import type { Word } from './overlay';

/*
 * Speech → timed words, for captions and for choosing moments by what is said. The audio is sent to a
 * Whisper server that speaks the OpenAI "audio/transcriptions" protocol (WHISPER_URL ends in /v1):
 * the bundled `whisper` container on the same machine, or a hosted service.
 */
export const captionsAvailable = () => Boolean(env.WHISPER_URL);

/** Long audio goes up in pieces of this many seconds (hosted services cap uploads at about 25 MB). */
const PIECE = 15 * 60;

interface WhisperWord {
  word?: string;
  text?: string;
  start?: number;
  end?: number;
}
interface WhisperJson {
  text?: string;
  words?: WhisperWord[];
  segments?: { start?: number; end?: number; text?: string; words?: WhisperWord[] }[];
}

/** The words in a Whisper answer, whichever of its shapes the server used. */
export function parseWhisper(json: WhisperJson, offset = 0): Word[] {
  const out: Word[] = [];
  const add = (w: WhisperWord) => {
    const text = (w.word ?? w.text ?? '').trim();
    if (text && typeof w.start === 'number' && typeof w.end === 'number') out.push({ start: w.start + offset, end: Math.max(w.end, w.start + 0.05) + offset, text });
  };
  if (json.words?.length) json.words.forEach(add);
  else
    for (const seg of json.segments ?? []) {
      if (seg.words?.length) seg.words.forEach(add);
      else if (seg.text && typeof seg.start === 'number' && typeof seg.end === 'number') {
        // No word times: spread the segment's words evenly over it
        const parts = seg.text.trim().split(/\s+/).filter(Boolean);
        const each = (seg.end - seg.start) / Math.max(1, parts.length);
        parts.forEach((text, i) => out.push({ start: seg.start! + i * each + offset, end: seg.start! + (i + 1) * each + offset, text }));
      }
    }
  return out.sort((a, b) => a.start - b.start);
}

async function send(audio: string, signal?: AbortSignal): Promise<WhisperJson> {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(await fs.promises.readFile(audio))], { type: 'audio/mpeg' }), 'audio.mp3');
  form.set('model', env.WHISPER_MODEL);
  form.set('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');
  let res: Response;
  try {
    res = await fetch(`${env.WHISPER_URL}/audio/transcriptions`, { method: 'POST', body: form, signal, headers: env.WHISPER_API_KEY ? { Authorization: `Bearer ${env.WHISPER_API_KEY}` } : undefined });
  } catch (e) {
    throw new Error(`the transcription service cannot be reached (${e instanceof Error ? e.message : 'network error'})`);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`the transcription service answered ${res.status}${text ? `: ${text.slice(0, 160)}` : ''}`);
  try {
    return JSON.parse(text) as WhisperJson;
  } catch {
    throw new Error('the transcription service sent an unreadable answer');
  }
}

/**
 * The words spoken in `length` seconds of `file` from `start`, timed from `start`. Only the sound is
 * sent (mono, 16 kHz, small MP3), in pieces when it is long.
 */
export async function transcribe(file: string, start: number, length: number, workDir: string, tag: string, signal?: AbortSignal, onProgress?: (fraction: number) => void): Promise<Word[]> {
  const words: Word[] = [];
  const pieces = Math.max(1, Math.ceil(length / PIECE));
  for (let i = 0; i < pieces; i++) {
    const from = i * PIECE;
    const span = Math.min(PIECE, length - from);
    const audio = path.join(workDir, `speech-${tag}-${i}.mp3`);
    try {
      await run(
        tools.ffmpeg,
        ['-hide_banner', '-nostdin', '-y', '-ss', (start + from).toFixed(3), '-t', span.toFixed(3), '-i', file, '-vn', '-sn', '-dn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k', audio],
        { signal, collect: false },
      );
      words.push(...parseWhisper(await send(audio, signal), from));
    } finally {
      await fs.promises.rm(audio, { force: true });
    }
    onProgress?.((i + 1) / pieces);
  }
  return words;
}

/** The words that fall inside a stretch, timed from its start. */
export function sliceWords(words: Word[], start: number, end: number): Word[] {
  return words.filter((w) => w.end > start && w.start < end).map((w) => ({ ...w, start: Math.max(0, w.start - start), end: Math.min(end, w.end) - start }));
}

export const wordsToText = (words: Word[]) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
