/**
 * Perplexity Service — Deep Research via Sonar API
 * 
 * Gebruikt voor:
 * - Stap 2: Research JSON (diepgaand onderzoek over het video-onderwerp)
 * - Stap 4: Trending Clips Research (actuele, virale clips zoeken)
 */

const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions';

interface PerplexityConfig {
  apiKey: string;
  model?: string;
}

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class PerplexityService {
  private apiKey: string;
  private model: string;

  constructor(config: PerplexityConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'sonar-deep-research';
  }

  async research(systemPrompt: string, userPrompt: string): Promise<string> {
    console.log(`[Perplexity] Starting research (model: ${this.model})...`);
    console.log(`[Perplexity] System prompt: ${systemPrompt.substring(0, 100)}...`);
    console.log(`[Perplexity] User prompt: ${userPrompt.substring(0, 200)}...`);

    const response = await fetch(PERPLEXITY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ] as PerplexityMessage[],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Perplexity API fout (${response.status}): ${text}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    console.log(`[Perplexity] Response received (${content.length} chars)`);
    return content;
  }

  /**
   * Stap 2: Research JSON
   * Voert diepgaand onderzoek uit en vult het research template in
   */
  async executeResearch(params: {
    title: string;
    description: string;
    researchTemplate: any;
    referenceVideoInfo?: string;
  }): Promise<any> {
    const systemPrompt = `Je bent een diepgaande researcher voor YouTube video productie.
Je ontvangt een research template (JSON) en een video-onderwerp.
Vul het COMPLETE template in met geverifieerde, feitelijke informatie.
Gebruik alleen betrouwbare bronnen. Geef bronvermelding bij alle claims.
Het resultaat wordt gebruikt als basis voor een professioneel YouTube script.
Geef ALLEEN de ingevulde JSON terug, geen extra tekst.`;

    const userPrompt = `VIDEO ONDERWERP: ${params.title}

BESCHRIJVING: ${params.description}

${params.referenceVideoInfo ? `REFERENTIE VIDEO INFORMATIE:\n${params.referenceVideoInfo}\n` : ''}

RESEARCH TEMPLATE (vul elk veld in):
${JSON.stringify(params.researchTemplate, null, 2)}

Vul het bovenstaande template VOLLEDIG in met feitelijke, geverifieerde informatie over het onderwerp.
Geef ALLEEN de ingevulde JSON terug.`;

    const response = await this.research(systemPrompt, userPrompt);

    // Parse JSON uit response
    try {
      return JSON.parse(response);
    } catch {
      // Probeer JSON uit markdown code block te halen
      const match = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        return JSON.parse(match[1].trim());
      }
      // Probeer gewoon het eerste JSON object te vinden
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Perplexity response bevat geen geldige JSON');
    }
  }

  /**
   * Stap 4: Trending Clips Research
   * Zoekt actuele, virale video clips voor het onderwerp
   */
  async executeTrendingClipsResearch(params: {
    title: string;
    description: string;
    researchData?: any;
    usedClips?: { url: string; timesUsed: number }[];
    maxClipDuration: number;
    videoType: string;
  }): Promise<any> {
    const systemPrompt = `Je bent een expert video researcher die virale YouTube clips zoekt voor video producties.

Je zoekt naar de MEEST RECENTE, MEEST RELEVANTE en MEEST VIRALE clips over een specifiek onderwerp.
Deze clips worden tussendoor afgespeeld in een video terwijl de voiceover STOPT.

REGELS:
- Zoek naar echte, bestaande YouTube video's
- Geef exacte timestamps (start en eind) van het relevante fragment
- Maximum clip duur: ${params.maxClipDuration} seconden per clip
- Rangschik op relevantie + viraliteit (hoogste eerst)
- Zoek 8-15 clips
- Geef context mee die de scriptschrijver kan gebruiken
- Clips moeten recent zijn (bij voorkeur laatste 6 maanden)
${params.usedClips && params.usedClips.length > 0 ? 
  `- EERDER GEBRUIKTE CLIPS (vermijd overmatig hergebruik):\n${params.usedClips.map(c => `  ${c.url} (${c.timesUsed}x gebruikt)`).join('\n')}` : ''}

Geef je antwoord als JSON met exact deze structuur:
{
  "topic": "onderwerp",
  "clips": [
    {
      "url": "https://youtube.com/watch?v=...",
      "title": "Video titel",
      "timestamp_start": "MM:SS",
      "timestamp_end": "MM:SS",
      "duration_seconds": 15,
      "relevance_score": 9,
      "virality_score": 8,
      "description": "Korte beschrijving van wat er te zien is",
      "context_for_script": "Context/informatie die in het script verwerkt kan worden",
      "channel_name": "Kanaal naam",
      "view_count": "1.2M",
      "publish_date": "2025-02-15",
      "previously_used": false,
      "times_used_before": 0
    }
  ],
  "max_clip_duration": ${params.maxClipDuration},
  "total_clips_found": 12
}

Geef ALLEEN de JSON terug, geen extra tekst.`;

    const userPrompt = `VIDEO ONDERWERP: ${params.title}
BESCHRIJVING: ${params.description}
VIDEO TYPE: ${params.videoType}

${params.researchData ? `RESEARCH DATA (gebruik dit als context):\n${JSON.stringify(params.researchData, null, 2).substring(0, 3000)}` : ''}

Zoek de meest recente, relevante en virale clips over dit onderwerp.`;

    const response = await this.research(systemPrompt, userPrompt);

    // Parse JSON
    try {
      return JSON.parse(response);
    } catch {
      const match = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) return JSON.parse(match[1].trim());
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      throw new Error('Perplexity response bevat geen geldige JSON voor clips');
    }
  }
}
