# RunPod Serverless Setup — FreeSurf Transcriber

Self-hosted GPU transcription with faster-whisper + pyannote.audio speaker diarization.

## Architecture

```
Mobile App → Cloudflare Worker (transcribe.freesurf.tools) → RunPod Serverless (GPU)
                                                               ├─ faster-whisper (STT)
                                                               └─ pyannote.audio (diarization)
```

## Prerequisites

1. **HuggingFace account** with accepted license for [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
2. **HF token** from https://huggingface.co/settings/tokens
3. **RunPod account** with API key
4. **Docker** installed locally for building the image

## Build & Push

```bash
cd serverless
docker build -t freesurf-transcriber:latest .
docker tag freesurf-transcriber:latest <registry>/freesurf-transcriber:latest
docker push <registry>/freesurf-transcriber:latest
```

The faster-whisper base model (~140MB) is pre-downloaded at build time. pyannote models (~200MB) download at first cold start.

## Create RunPod Serverless Endpoint

1. Go to https://www.runpod.io/console/serverless → New Endpoint
2. **Template**: select your pushed Docker image
3. **GPU**: NVIDIA T4 (16GB) minimum — L4 (24GB) recommended for faster inference
4. **Min workers**: 0, **Max workers**: 2
5. **Idle timeout**: 60 seconds
6. **Environment variable**: `HF_TOKEN` = your HuggingFace access token
7. Note the **Endpoint ID**

## Deploy Cloudflare Worker

```bash
cd worker
npm install
npx wrangler secret put RUNPOD_API_KEY
npx wrangler secret put RUNPOD_ENDPOINT_ID
npx wrangler secret put OPENROUTER_API_KEY    # fallback STT
npx wrangler deploy
```

## GPU Sizing

| Whisper Model | VRAM Needed | GPU | Transcription Speed |
|---|---|---|---|
| base (74M) | ~2GB + ~1GB pyannote | T4 (16GB) ✓ | ~5-10x real-time |
| small (244M) | ~3GB + ~1GB pyannote | T4 (16GB) ✓ | ~8-15x real-time |
| medium (769M) | ~5GB + ~1GB pyannote | L4 (24GB) ✓ | ~10-20x real-time |

To switch models, change `WHISPER_MODEL_SIZE` in `handler.py` and rebuild the Docker image.

## Performance

| State | Latency |
|---|---|
| Warm request (5 min audio) | ~30-60s |
| Cold start (container + pyannote download) | ~45-90s first request |

## Pricing

~$0.02-0.05 per 5-minute audio on T4. With 0 min workers, you only pay for actual transcription time.

## Troubleshooting

- **pyannote auth error**: Verify `HF_TOKEN` env var is set and you've accepted the model license at huggingface.co
- **OOM errors**: Switch to `base` model or use a GPU with ≥16GB VRAM
- **No diarization in output**: Check boot logs — if `HF_TOKEN` isn't set, diarization is skipped gracefully and you get single-speaker output
- **Cold start timeout**: RunPod `/runsync` has a timeout — for very long first-request cold starts with pyannote download, consider using `/run` + polling
