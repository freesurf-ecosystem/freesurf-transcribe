/**
 * FreeSurf Transcriber — Cloudflare Worker
 * Proxies audio → RunPod (faster-whisper + pyannote diarization).
 */
export interface Env {
  RUNPOD_API_KEY: string;
  RUNPOD_ENDPOINT_ID: string;
}

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    }

    if (url.pathname !== "/api/transcribe") {
      return jsonResponse({ error: "Not found" }, 404, headers);
    }

    if (!env.RUNPOD_API_KEY || !env.RUNPOD_ENDPOINT_ID) {
      return jsonResponse({ error: "Transcription not configured" }, 500, headers);
    }

    try {
      const body = (await request.json()) as { audio_base64: string; language?: string };
      if (!body.audio_base64) {
        return jsonResponse({ error: "No audio data provided" }, 400, headers);
      }

      const runpodRes = await fetch(
        `${RUNPOD_API_BASE}/${env.RUNPOD_ENDPOINT_ID}/runsync`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RUNPOD_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input: {
              audio_base64: body.audio_base64,
              language: body.language || null,
            },
          }),
        }
      );

      const runpodData = (await runpodRes.json()) as {
        output?: { segments?: unknown[]; text?: string; language?: string; duration?: number; model?: string; error?: string };
        error?: string;
      };

      if (!runpodRes.ok || runpodData.error || runpodData.output?.error) {
        return jsonResponse(
          { error: runpodData.error || runpodData.output?.error || "RunPod request failed" },
          runpodRes.status || 500,
          headers
        );
      }

      return jsonResponse(runpodData.output || {}, 200, headers);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Internal server error";
      return jsonResponse({ error: msg }, 500, headers);
    }
  },
};
