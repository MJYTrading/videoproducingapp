/**
 * LLM Service met automatische fallback
 * 
 * Probeert eerst Elevate Chat API, bij falen → Anthropic API direct.
 * Beide gebruiken Claude Sonnet 4.5.
 */

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
}

interface LLMResponse {
  content: string;
  model: string;
  provider: 'elevate' | 'anthropic';
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface LLMKeys {
  elevateApiKey?: string;
  anthropicApiKey?: string;
}

// ─── Elevate Chat API (OpenAI-compatible) ───
async function callElevate(
  apiKey: string,
  messages: LLMMessage[],
  options: LLMOptions
): Promise<LLMResponse> {
  const response = await fetch('https://chat-api.elevate.uno/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4.5',
      max_tokens: options.maxTokens ?? 8192,
      temperature: options.temperature ?? 0.7,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Elevate API fout (${response.status}): ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();

  if (!data.choices?.[0]?.message?.content) {
    throw new Error('Elevate gaf lege response (0 tokens) — waarschijnlijk tijdelijk probleem');
  }

  return {
    content: data.choices[0].message.content,
    model: data.model || 'claude-sonnet-4.5',
    provider: 'elevate',
    usage: data.usage,
  };
}

// ─── Anthropic API (native) ───
async function callAnthropic(
  apiKey: string,
  messages: LLMMessage[],
  options: LLMOptions
): Promise<LLMResponse> {
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }));

  const body: any = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: options.maxTokens ?? 8192,
    temperature: options.temperature ?? 0.7,
    messages: chatMessages,
  };

  if (systemMsg) {
    body.system = systemMsg.content;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API fout (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();

  if (!data.content?.[0]?.text) {
    throw new Error('Anthropic gaf lege response');
  }

  return {
    content: data.content[0].text,
    model: data.model || 'claude-sonnet-4-5-20250929',
    provider: 'anthropic',
    usage: data.usage ? {
      prompt_tokens: data.usage.input_tokens,
      completion_tokens: data.usage.output_tokens,
      total_tokens: data.usage.input_tokens + data.usage.output_tokens,
    } : undefined,
  };
}

// ─── Hoofdfunctie met fallback ───
export async function callLLM(
  keys: LLMKeys,
  messages: LLMMessage[],
  options: LLMOptions = {}
): Promise<LLMResponse> {
  if (keys.elevateApiKey) {
    try {
      const result = await callElevate(keys.elevateApiKey, messages, options);
      console.log(`[LLM] Elevate succesvol (${result.usage?.total_tokens || '?'} tokens)`);
      return result;
    } catch (error: any) {
      console.log(`[LLM] Elevate gefaald: ${error.message}`);
    }
  }

  if (keys.anthropicApiKey) {
    try {
      const result = await callAnthropic(keys.anthropicApiKey, messages, options);
      console.log(`[LLM] Anthropic fallback succesvol (${result.usage?.total_tokens || '?'} tokens)`);
      return result;
    } catch (error: any) {
      throw new Error(`Beide LLM providers gefaald. Anthropic: ${error.message}`);
    }
  }

  throw new Error('Geen LLM API key beschikbaar. Stel Elevate of Anthropic key in via Instellingen.');
}

// ─── Helper functies ───
export async function llmSimplePrompt(
  keys: LLMKeys,
  systemPrompt: string,
  userPrompt: string,
  options: LLMOptions = {}
): Promise<string> {
  const result = await callLLM(keys, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], options);
  return result.content;
}

export async function llmJsonPrompt<T = any>(
  keys: LLMKeys,
  systemPrompt: string,
  userPrompt: string,
  options: LLMOptions = {}
): Promise<T> {
  const content = await llmSimplePrompt(keys, systemPrompt, userPrompt, {
    ...options,
    temperature: options.temperature ?? 0.5,
  });

  let jsonStr = content.trim();
  
  // Strip markdown code blocks (ook als afsluitende ``` ontbreekt)
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '');
    jsonStr = jsonStr.replace(/\n?\s*```\s*$/, '');
  }
  
  // Pak alleen het JSON object (skip tekst ervoor/erna)
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    throw new Error(`LLM response is geen geldige JSON. Eerste 500 chars: ${jsonStr.slice(0, 500)}`);
  }
}
