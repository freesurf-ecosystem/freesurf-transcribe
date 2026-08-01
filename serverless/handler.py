"""
RunPod Serverless handler for FreeSurf Transcriber.
faster-whisper (STT) + pyannote.audio (speaker diarization).

Expected input:  { "input": { "audio_base64": "...", "language": "en" } }
Returns:         { "segments": [{ speaker, start, end, text }], "text": "...", "language": "en", "duration": 45.3 }
"""
print("BOOT: handler.py starting", flush=True)

import base64
import io
import os
import subprocess
import tempfile
import traceback
import sys
import time
import runpod

try:
    import torch
    import numpy as np
    import soundfile as sf
    from faster_whisper import WhisperModel
    from pyannote.audio import Pipeline

    print(f"CUDA available: {torch.cuda.is_available()}", flush=True)
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}", flush=True)
        print(f"VRAM: {torch.cuda.get_device_properties(0).total_mem / 1024**3:.0f}GB", flush=True)
    print("All imports OK", flush=True)
except Exception:
    traceback.print_exc()
    sys.stderr.flush()
    raise

WHISPER_MODEL_SIZE = "base"

_model = None
_diarization_pipeline = None


def get_whisper_model():
    global _model
    if _model is None:
        print(f"Loading faster-whisper ({WHISPER_MODEL_SIZE})...", flush=True)
        _model = WhisperModel(
            WHISPER_MODEL_SIZE,
            device="cuda" if torch.cuda.is_available() else "cpu",
            compute_type="float16" if torch.cuda.is_available() else "int8",
        )
        print("Whisper model ready", flush=True)
    return _model


def get_diarization_pipeline():
    global _diarization_pipeline
    if _diarization_pipeline is None:
        hf_token = os.environ.get("HF_TOKEN", "")
        if not hf_token:
            print("WARNING: HF_TOKEN not set — diarization will be skipped", flush=True)
            return None
        print("Loading pyannote diarization pipeline...", flush=True)
        _diarization_pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token,
        )
        print("Diarization pipeline ready", flush=True)
    return _diarization_pipeline


def decode_audio_to_wav(audio_base64: str) -> str:
    audio_bytes = base64.b64decode(audio_base64)
    input_path = None
    wav_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as f:
            f.write(audio_bytes)
            input_path = f.name

        wav_path = input_path + ".wav"
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-ar", "16000", "-ac", "1", "-sample_fmt", "s16", wav_path],
            capture_output=True,
            check=True,
            timeout=120,
        )
        return wav_path
    finally:
        if input_path and os.path.exists(input_path):
            os.unlink(input_path)


def merge_diarization(whisper_segments, diarization):
    turns = list(diarization.itertracks(yield_label=True))
    merged = []

    for seg in whisper_segments:
        seg_start = seg.start
        seg_end = seg.end
        best_speaker = "SPEAKER_0"
        max_overlap = 0.0

        for turn, _, speaker in turns:
            overlap_start = max(seg_start, turn.start)
            overlap_end = min(seg_end, turn.end)
            overlap = max(0.0, overlap_end - overlap_start)
            if overlap > max_overlap:
                max_overlap = overlap
                best_speaker = speaker

        merged.append({
            "speaker": best_speaker,
            "start": round(seg_start, 2),
            "end": round(seg_end, 2),
            "text": seg.text.strip(),
        })

    return merged


def build_plain_text(segments):
    lines = []
    current_speaker = None
    for seg in segments:
        speaker = seg["speaker"]
        text = seg["text"]
        if speaker != current_speaker:
            lines.append(f"\n{speaker}: {text}")
            current_speaker = speaker
        else:
            lines.append(text)
    return "\n".join(lines).strip()


def handler(event):
    job_input = event.get("input", {})
    audio_base64 = job_input.get("audio_base64", "")
    language = job_input.get("language", None)

    if not audio_base64:
        return {"error": "No audio_base64 provided"}

    wav_path = None
    try:
        wav_path = decode_audio_to_wav(audio_base64)

        model = get_whisper_model()
        whisper_segments, info = model.transcribe(
            wav_path,
            beam_size=5,
            language=language,
            vad_filter=True,
        )

        raw_segments = list(whisper_segments)

        pipeline = get_diarization_pipeline()
        if pipeline is not None:
            try:
                diarization = pipeline(wav_path)
                segments = merge_diarization(raw_segments, diarization)
            except Exception:
                segments = [
                    {"speaker": "SPEAKER_0", "start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}
                    for s in raw_segments
                ]
        else:
            segments = [
                {"speaker": "SPEAKER_0", "start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}
                for s in raw_segments
            ]

        plain_text = build_plain_text(segments)

        return {
            "segments": segments,
            "text": plain_text,
            "language": info.language,
            "duration": round(info.duration, 2),
            "model": f"faster-whisper-{WHISPER_MODEL_SIZE} + pyannote-3.1",
        }

    except Exception:
        return {"error": traceback.format_exc()}
    finally:
        if wav_path and os.path.exists(wav_path):
            os.unlink(wav_path)


if __name__ == "__main__":
    try:
        print("Pre-warming models...", flush=True)
        get_whisper_model()
        get_diarization_pipeline()
        print("All models ready!", flush=True)
        runpod.serverless.start({"handler": handler})
    except Exception:
        traceback.print_exc()
        sys.stderr.flush()
        raise
