/**
 * Elevate Chat API Service
 * 
 * Praat met de Elevate Chat API (OpenAI-compatible) om Claude Sonnet 4.5 aan te roepen.
 * Gebruikt voor: style profiles maken, scripts schrijven, scene prompts genereren.
 */

interface ElevateMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ElevateOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface ElevateResponse {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const ELEVATE_CHAT_URL = 'https://chat-api.elevate.uno/v1/chat/completions';
const DEFAULT_MODEL = 'claude-sonnet-4.5';

export async function callElevateChat(
  apiKey: string,
  messages: ElevateMessage[],
  options: ElevateOptions = {}
): Promise<ElevateResponse> {
  const {
    model = DEFAULT_MODEL,
    maxTokens = 8192,
    temperature = 0.7,
  } = options;

  if (!apiKey) {
    throw new Error('Elevate API key ontbreekt. Stel deze in via Instellingen.');
  }

  const response = await fetch(ELEVATE_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Elevate API fout (${response.status})`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
    } catch {}
    throw new Error(errorMessage);
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0]?.message?.content) {
    throw new Error('Onverwachte response van Elevate API: geen content');
  }

  return {
    content: data.choices[0].message.content,
    model: data.model || model,
    usage: data.usage,
  };
}

export async function elevateSimplePrompt(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  options: ElevateOptions = {}
): Promise<string> {
  const result = await callElevateChat(apiKey, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], options);
  return result.content;
}

export async function elevateJsonPrompt<T = any>(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  options: ElevateOptions = {}
): Promise<T> {
  const content = await elevateSimplePrompt(apiKey, systemPrompt, userPrompt, {
    ...options,
    temperature: options.temperature ?? 0.5,
  });

  let jsonStr = content.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    throw new Error(`Elevate response is geen geldige JSON. Eerste 500 chars: ${jsonStr.slice(0, 500)}`);
  }
}
