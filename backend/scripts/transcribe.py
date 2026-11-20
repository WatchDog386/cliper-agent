#!/usr/bin/env python3
"""
Word-level transcript for Cliper Agent's auto captions and smart cuts.

    python3 transcribe.py <audio-or-video> [model] [language]

Prints one JSON object on stdout: {"language": "en", "words": [{"s": 0.0, "e": 0.4, "w": "Hello"}, ...]}
and progress lines "PROGRESS 0.42" on stderr. Uses faster-whisper on the CPU (int8), so no GPU is
needed; the model ("base" by default) is downloaded on first use and cached.
"""
import json
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: transcribe.py <file> [model] [language]", file=sys.stderr)
        return 2
    src = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else "base"
    language = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper is not installed (pip install faster-whisper)", file=sys.stderr)
        return 3
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(src, language=language, word_timestamps=True, vad_filter=True)
    words = []
    total = max(info.duration or 1.0, 1.0)
    for seg in segments:
        for w in seg.words or []:
            text = w.word.strip()
            if text:
                words.append({"s": round(w.start, 3), "e": round(w.end, 3), "w": text})
        print(f"PROGRESS {min(1.0, seg.end / total):.3f}", file=sys.stderr, flush=True)
    json.dump({"language": info.language, "words": words}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
