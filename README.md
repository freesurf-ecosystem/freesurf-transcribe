# FreeSurf Transcriber

Speech-to-text with speaker diarization. No account required. No audio stored.

Record or import audio, and get a full transcript with speaker labels, timestamps, and plain text export. Built for meetings, interviews, podcasts, and conversations.

## Why it's free

The transcriber uses [faster-whisper](https://github.com/SYSTRAN/faster-whisper) for transcription and [pyannote.audio](https://github.com/pyannote/pyannote-audio) for speaker diarization — both self-hosted on our own GPU infrastructure. No per-minute API fees. The app is supported by minimal, non-intrusive ads. Premium removes ads.

## Privacy

- No account or login required
- Audio processed on our GPU and immediately deleted — nothing stored
- Transcripts saved locally on your device only
- No audio leaves the app except for the transcription request

## Diarization

Speaker diarization labels each segment of the transcript with who's speaking, with timestamps down to the second. Toggle between speaker-segmented view and plain text. Use it for:

- Meeting notes with speaker attribution
- Interview transcripts
- Podcast captions
- Multi-speaker conversations

## Features

- Record audio or import files
- Speaker-labeled segments with timestamps
- Toggle between speaker view and plain text
- Edit transcript inline
- Copy and share
- Save last 50 transcriptions locally

## Tech

- **Mobile:** React Native (Expo)
- **Backend:** Cloudflare Worker
- **STT:** faster-whisper on RunPod GPU (self-hosted)
- **Diarization:** pyannote.audio (self-hosted)
- **No OpenAI, no Google, no API subscriptions**

[Privacy Policy](https://freesurf.tools/privacy) · [Terms](https://freesurf.tools/terms)
