/**
 * FreeSurf Transcriber — Cloudflare Worker
 * Proxies audio → RunPod (faster-whisper + pyannote diarization).
 */
export interface Env {
  POD_URL: string;
  DEEPGRAM_API_KEY?: string;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Deepgram Nova-3 with diarization → returns the same { segments, text } shape the
// pod (faster-whisper + pyannote) produced, so mobile is unchanged.
async function transcribeWithDeepgram(
  apiKey: string,
  audio: Uint8Array,
  language?: string
): Promise<{ segments: any[]; text: string; language: string; duration?: number }> {
  const qs = new URLSearchParams({ model: "nova-3", diarize: "true", utterances: "true", smart_format: "true" });
  if (language && language !== "auto") qs.set("language", language);
  const res = await fetch(`https://api.deepgram.com/v1/listen?${qs.toString()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "audio/mp4" },
    body: audio,
  });
  const data = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(data?.err_msg || data?.message || `Deepgram error ${res.status}`);
  }
  const alt = data?.results?.channels?.[0]?.alternatives?.[0] || {};
  const utterances = (data?.results?.utterances || []).map((u: any, i: number) => ({
    speaker: u.speaker ?? i,
    start: u.start,
    end: u.end,
    text: u.transcript,
  }));
  const segments = utterances.length ? utterances : [{ speaker: 0, start: 0, end: alt.duration || 0, text: alt.transcript }];
  return {
    segments,
    text: (alt.transcript || segments.map((s: any) => s.text).join(" ")).trim(),
    language: (data?.metadata?.language || language || "en"),
    duration: alt.duration,
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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
      return htmlResponse(LANDING_HTML, headers);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    }

    if (url.pathname !== "/api/transcribe") {
      return jsonResponse({ error: "Not found" }, 404, headers);
    }

    if (!env.POD_URL && !env.DEEPGRAM_API_KEY) {
      return jsonResponse({ error: "Transcription not configured" }, 500, headers);
    }

    try {
      const body = (await request.json()) as { audio_base64: string; language?: string };
      if (!body.audio_base64) {
        return jsonResponse({ error: "No audio data provided" }, 400, headers);
      }

      // Hosted Deepgram (Nova-3 + diarization) path. Falls back to the pod when no key.
      if (env.DEEPGRAM_API_KEY) {
        try {
          const out = await transcribeWithDeepgram(env.DEEPGRAM_API_KEY, b64ToBytes(body.audio_base64), body.language);
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

      return jsonResponse(podData, 200, headers);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Internal server error";
      return jsonResponse({ error: msg }, 500, headers);
    }
  },
};
