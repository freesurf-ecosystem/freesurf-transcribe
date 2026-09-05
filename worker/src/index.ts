/**
 * FreeSurf Transcriber — Cloudflare Worker
 * Proxies audio → RunPod (faster-whisper + pyannote diarization).
 */
export interface Env {
  POD_URL: string;
  TOGETHER_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TRANSCRIBER_WEEKLY_SECONDS?: string;
}

const TRANSCRIBE_METRIC = "transcribe_seconds";
const DEFAULT_WEEKLY_SECONDS = 3600; // 1 hour/week

function srHeaders(env: Env): Record<string, string> {
  return { apikey: env.SUPABASE_SERVICE_ROLE_KEY || "", Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY || ""}` };
}
function weekStartIso(now: Date): string {
  const day = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day)).toISOString().slice(0, 10);
}
async function authedUserId(env: Env, authHeader: string): Promise<string | null> {
  if (!authHeader.startsWith("Bearer ") || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authHeader } });
    if (!res.ok) return null;
    return ((await res.json()) as { id?: string })?.id || null;
  } catch { return null; }
}
async function readUsage(env: Env, userId: string, metric: string, week: string): Promise<number> {
  try {
    const q = new URLSearchParams({ user_id: `eq.${userId}`, metric: `eq.${metric}`, week_start: `eq.${week}`, select: "count" });
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/usage?${q.toString()}`, { headers: srHeaders(env) });
    if (!res.ok) return 0;
    return Number(((await res.json()) as any[])?.[0]?.count) || 0;
  } catch { return 0; }
}
async function incrementUsage(env: Env, userId: string, metric: string, week: string, delta: number): Promise<number> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/meter_usage`, {
    method: "POST", headers: { ...srHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: userId, p_metric: metric, p_week: week, p_delta: delta }),
  });
  if (!res.ok) return 0;
  const n = Number(await res.text());
  return Number.isFinite(n) ? n : 0;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sniffAudioMime(b64: string): string {
  if (/^UklGR/.test(b64)) return "audio/wav";           // RIFF....WAVE
  if (/^SUQz|^eXBs|^2bnn|^ADTS/.test(b64)) return "audio/mp4";
  if (/^fLaC/.test(b64)) return "audio/flac";
  if (/^OggS/.test(b64)) return "audio/ogg";
  if (/^GkXf|^1A45DFA3/.test(b64)) return "audio/webm";
  if (/^\/\*|^SUQz|^ID3|^\u00ff/.test(b64)) return "audio/mpeg"; // mp3 ID3/0xFFFB
  // M4A/MP4 boxes start with ftyp (size + 'ftyp')
  if (/^AAAA?GZhdHA|^[A-Za-z0-9]{4}ZnR5cA/.test(b64)) return "audio/mp4";
  return "audio/mpeg";
}

// Together Parakeet-TDT with diarization → same { segments, text } shape the pod
// (faster-whisper + pyannote) produced, so mobile is unchanged.
async function transcribeWithTogether(
  apiKey: string,
  audio: Uint8Array,
  mime: string,
  language?: string
): Promise<{ segments: any[]; text: string; language: string; duration?: number }> {
  const fd = new FormData();
  fd.append("model", "nvidia/parakeet-tdt-0.6b-v3");
  fd.append("diarize", "true");
  fd.append("response_format", "verbose_json");
  if (language && language !== "auto") fd.append("language", language);
  fd.append("file", new Blob([audio], { type: mime }), "audio");

  const res = await fetch("https://api.together.ai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });
  const data = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.message || `Together transcription error ${res.status}`);
  }
  const text = String(data?.text || "").trim();
  let segments: any[] = (data?.speaker_segments || []).map((s: any, i: number) => ({
    speaker: s.speaker_id ?? i,
    start: s.start ?? 0,
    end: s.end ?? 0,
    text: s.text ?? "",
  }));
  if (!segments.length && Array.isArray(data?.segments)) {
    segments = (data.segments as any[]).map((s, i) => ({
      speaker: 0,
      start: s.start ?? 0,
      end: s.end ?? 0,
      text: s.text ?? "",
    }));
  }
  if (!segments.length && text) {
    segments = [{ speaker: 0, start: 0, end: data?.duration || 0, text }];
  }
  return {
    segments,
    text: text || segments.map((s: any) => s.text).join(" ").trim(),
    language: data?.language || language || "en",
    duration: data?.duration,
  };
}

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8081",
  "https://freesurf.tools",
];

function corsHeaders(origin: string): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.some(
    (o) => origin === o || origin.startsWith("exp://") || origin.startsWith("http://localhost")
  );
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function jsonResponse(data: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function htmlResponse(html: string, headers: Record<string, string>) {
  return new Response(html, { status: 200, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}

const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Meeting Transcriber · FreeSurf</title>
<meta name="description" content="Turn audio recordings and meetings into clean, searchable transcripts with speaker labels."/>
<style>
  :root { color-scheme: light dark; --bg:#ffffff; --text:#1d1b18; --muted:#8a8178; --brand:#1d1b18; --border:#e6e4df; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0a0a0c; --text:#fff; --muted:#8b8b9a; --brand:#6b8cff; --border:#2c2c3a; } }
  * { box-sizing:border-box; }
  body { margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--text); }
  .wrap { max-width:880px; margin:0 auto; padding:64px 24px; }
  .logo { font-weight:700; text-decoration:none; color:var(--text); }
  h1 { font-size:44px; line-height:1.1; margin:40px 0 12px; }
  .lede { font-size:18px; color:var(--muted); margin:0 0 28px; }
  .phone { border:2px dashed var(--border); border-radius:20px; height:300px; display:flex; align-items:center; justify-content:center; color:var(--muted); margin:32px 0; }
  .stores { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:40px; }
  .store { text-decoration:none; padding:12px 20px; border-radius:10px; border:1.5px solid var(--border); color:var(--text); font-weight:600; }
  .store.play { background:var(--brand); color:#fff; border-color:var(--brand); }
  .store.soon { opacity:.55; cursor:default; }
  footer { margin-top:48px; padding-top:20px; border-top:1px solid var(--border); color:var(--muted); font-size:14px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  footer a { color:var(--muted); text-decoration:none; }
</style>
</head>
<body>
<div class="wrap">
  <a class="logo" href="https://freesurf.tools">FreeSurf</a>
  <h1>Meeting Transcriber</h1>
  <p class="lede">Turn recordings and meetings into clean, searchable transcripts — with speaker labels, so you always know who said what.</p>
  <div class="phone">Phone screenshots coming soon</div>
  <div class="stores">
    <a class="store play" href="https://play.google.com/store/apps/details?id=tools.freesurf.transcriber" target="_blank" rel="noopener">Get it on Google Play</a>
    <span class="store soon">App Store · Upcoming</span>
  </div>
  <footer>
    <span>&copy; <span id="year"></span> FreeSurf · Free tools, no bullshit.</span>
    <a href="https://feedfree.tech" target="_blank" rel="noopener">Feedfree Digest</a>
  </footer>
</div>
<script>document.getElementById('year').textContent=new Date().getFullYear()</script>
</body>
</html>`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    // Landing page for browsers; keep the API on /api/transcribe.
    if (request.method === "GET") {
      if (url.pathname === "/sitemap.xml") {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://transcribe.freesurf.tools/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>
</urlset>`;
        return new Response(xml, { status: 200, headers: { "Content-Type": "application/xml" } });
      }
      // Usage meter — how much of the weekly allowance is left.
      if (url.pathname === "/api/usage") {
        if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) {
          return jsonResponse({ error: "Usage metering not configured" }, 500, headers);
        }
        const userId = await authedUserId(env, request.headers.get("Authorization") || "");
        if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, headers);
        const week = weekStartIso(new Date());
        const limit = Math.max(0, Number(env.TRANSCRIBER_WEEKLY_SECONDS) || DEFAULT_WEEKLY_SECONDS);
        const used = await readUsage(env, userId, TRANSCRIBE_METRIC, week);
        return jsonResponse({ usage: { metric: TRANSCRIBE_METRIC, used, limit, reset: week } }, 200, headers);
      }
      return htmlResponse(LANDING_HTML, headers);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    }

    if (url.pathname !== "/api/transcribe") {
      return jsonResponse({ error: "Not found" }, 404, headers);
    }

    if (!env.POD_URL && !env.TOGETHER_API_KEY) {
      return jsonResponse({ error: "Transcription not configured" }, 500, headers);
    }

    try {
      const body = (await request.json()) as { audio_base64: string; language?: string };
      if (!body.audio_base64) {
        return jsonResponse({ error: "No audio data provided" }, 400, headers);
      }

      // Weekly free-allowance gate (only active when Supabase metering is configured).
      // Duration is only known after transcription, so we pre-block when the cap is
      // already reached, then add this clip's seconds after a successful run.
      let meter: { userId: string; week: string; limit: number } | null = null;
      if (env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_URL) {
        const userId = await authedUserId(env, request.headers.get("Authorization") || "");
        if (!userId) return jsonResponse({ error: "Please sign in to use the transcriber." }, 401, headers);
        const week = weekStartIso(new Date());
        const limit = Math.max(0, Number(env.TRANSCRIBER_WEEKLY_SECONDS) || DEFAULT_WEEKLY_SECONDS);
        const used = await readUsage(env, userId, TRANSCRIBE_METRIC, week);
        if (used >= limit) {
          return jsonResponse(
            { error: "Weekly limit reached — upgrade or try again next week.", usage: { metric: TRANSCRIBE_METRIC, used, limit, reset: week } },
            429,
            headers
          );
        }
        meter = { userId, week, limit };
      }

      // Hosted Together Parakeet-TDT (diarize) path. Falls back to the pod when no key.
      if (env.TOGETHER_API_KEY) {
        try {
          const out = await transcribeWithTogether(
            env.TOGETHER_API_KEY,
            b64ToBytes(body.audio_base64),
            sniffAudioMime(body.audio_base64),
            body.language
          );
          if (meter) await incrementUsage(env, meter.userId, TRANSCRIBE_METRIC, meter.week, Math.max(1, Math.ceil(out.duration || 0)));
          return jsonResponse(out, 200, headers);
        } catch (e: unknown) {
          return jsonResponse({ error: e instanceof Error ? e.message : "Transcription failed" }, 500, headers);
        }
      }

      const podRes = await fetch(env.POD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_type: "transcribe",
          audio_base64: body.audio_base64,
          language: body.language || null,
        }),
      });

      const podData = (await podRes.json()) as {
        segments?: unknown[];
        text?: string;
        language?: string;
        duration?: number;
        error?: string;
      };

      if (!podRes.ok || podData.error) {
        return jsonResponse({ error: podData.error || "Transcription failed" }, podRes.status || 500, headers);
      }

      if (meter) await incrementUsage(env, meter.userId, TRANSCRIBE_METRIC, meter.week, Math.max(1, Math.ceil(podData.duration || 0)));
      return jsonResponse(podData, 200, headers);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Internal server error: " + String(e);
      return jsonResponse({ error: msg }, 500, headers);
    }
  },
};
