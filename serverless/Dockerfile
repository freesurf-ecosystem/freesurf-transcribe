# FreeSurf Transcriber — faster-whisper + pyannote for RunPod Serverless
# CUDA 12.4 (matching RunPod GPU drivers)
FROM nvidia/cuda:12.4.0-runtime-ubuntu22.04

ENV TZ=UTC
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y --no-install-recommends software-properties-common \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y --no-install-recommends \
    python3.12 python3.12-venv python3.12-dev git curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1 \
    && python3 -m ensurepip --upgrade \
    && python3 -m pip install --upgrade pip

# PyTorch with CUDA 12.4 (needed by faster-whisper)
RUN pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124

# Transcription + diarization deps
RUN pip install faster-whisper pyannote.audio librosa soundfile numpy

# RunPod SDK
RUN pip install runpod

# Pre-download faster-whisper base model (~140MB) during build — no fetch on cold start
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8'); print('Whisper model cached OK')"

COPY handler.py /handler.py

CMD ["python3", "-u", "/handler.py"]
