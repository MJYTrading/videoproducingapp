/**
 * YouTube Transcript Service
 */

const YOUTUBE_TRANSCRIPT_BASE = 'https://www.youtubetranscript.dev/api/v2';

interface TranscriptResult {
  videoId: string;
  videoTitle: string;
  language: string;
  text: string;
  creditsUsed: number;
}

interface BatchTranscriptResult {
  results: TranscriptResult[];
  failures: Array<{ videoId: string; error: string }>;
}

export function extractVideoId(input: string): string {
  input = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  const watchMatch = input.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  const shortMatch = input.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  const embedMatch = input.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];
  throw new Error(`Kan geen video ID extraheren uit: ${input}`);
}

export async function fetchTranscript(
  apiKey: string,
  videoUrl: string,
  language?: string
): Promise<TranscriptResult> {
  if (!apiKey) {
    throw new Error('YouTube Transcript API key ontbreekt. Stel deze in via Instellingen.');
  }
  const videoId = extractVideoId(videoUrl);
  const body: any = { video: videoId };
  if (language) body.language = language;

  const response = await fetch(`${YOUTUBE_TRANSCRIPT_BASE}/transcribe`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Transcript API fout (${response.status})`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error || errorJson.message || errorMessage;
    } catch {}
    throw new Error(`Transcript mislukt voor ${videoUrl}: ${errorMessage}`);
  }

  const data = await response.json();
  if (!data.data?.transcript?.text) {
    throw new Error(`Geen transcript beschikbaar voor ${videoUrl}`);
  }

  return {
    videoId,
    videoTitle: data.data.video_title || videoId,
    language: data.language || 'unknown',
    text: data.data.transcript.text,
    creditsUsed: data.credits_used || 0,
  };
}

export async function fetchTranscriptsBatch(
  apiKey: string,
  videoUrls: string[],
  language?: string
): Promise<BatchTranscriptResult> {
  const results: TranscriptResult[] = [];
  const failures: Array<{ videoId: string; error: string }> = [];

  for (const url of videoUrls) {
    try {
      const result = await fetchTranscript(apiKey, url, language);
      results.push(result);
    } catch (error: any) {
      const videoId = (() => {
        try { return extractVideoId(url); } catch { return url; }
      })();
      failures.push({ videoId, error: error.message });
    }
  }

  return { results, failures };
}
