// Hard-coded live-capture policy. Change these only in a new build.
export const LIVE_REFRESH_MS = 5000;
export const LIVE_NOTES_EARLY_MS = 5000;
export const LIVE_NOTES_LATE_MS = 30000;
export const LIVE_NOTES_EARLY_WINDOW_MS = 60000;
export const LIVE_MAX_SESSION_MS = 10 * 60 * 1000;
export const LIVE_MAX_REFRESHES = Math.floor(LIVE_MAX_SESSION_MS / LIVE_REFRESH_MS);
export const LIVE_MAX_AUDIO_BYTES = 20 * 1024 * 1024;
