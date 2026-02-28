/**
 * Perplexity Service v2 — Deep Research via Sonar API
 * 
 * Verbeteringen v2:
 * - Betere prompts met expliciete instructies voor kwaliteit
 * - Research completeness validatie + retry
 * - YouTube URL validatie voor clips
 * - Structurele integriteit checks op JSON output
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

    console.log(`[Perplexity] Response ontvangen (${content.length} chars)`);
    return content;
  }

  /**
   * Parse JSON uit een LLM response (handles markdown blocks, text before/after)
   */
  private parseJsonResponse(response: string): any {
    // Poging 1: directe JSON parse
    try {
      return JSON.parse(response.trim());
    } catch {}

    // Poging 2: uit markdown code block
    const codeMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeMatch) {
      try { return JSON.parse(codeMatch[1].trim()); } catch {}
    }

    // Poging 3: eerste { tot laatste }
    const firstBrace = response.indexOf('{');
    const lastBrace = response.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try { return JSON.parse(response.slice(firstBrace, lastBrace + 1)); } catch {}
    }

    // Poging 4: eerste [ tot laatste ]
    const firstBracket = response.indexOf('[');
    const lastBracket = response.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      try { return JSON.parse(response.slice(firstBracket, lastBracket + 1)); } catch {}
    }

    throw new Error('Response bevat geen geldige JSON');
  }

  // ══════════════════════════════════════════════════
  // STAP 2: RESEARCH JSON
  // ══════════════════════════════════════════════════

  /**
   * Voert diepgaand onderzoek uit en vult het research template in.
   * Inclusief kwaliteitsvalidatie en retry bij incompleet resultaat.
   */
  async executeResearch(params: {
    title: string;
    description: string;
    researchTemplate: any;
    referenceVideoInfo?: string;
    maxRetries?: number;
  }): Promise<any> {
    const maxRetries = params.maxRetries ?? 2;

    const systemPrompt = `Je bent een diepgaande researcher voor YouTube video productie.
Je ontvangt een research template (JSON) en een video-onderwerp.

REGELS:
- Vul ALLE velden in het template in. Laat GEEN enkel veld leeg.
- Gebruik alleen geverifieerde, feitelijke informatie met bronvermelding.
- Voor arrays (events, players, etc.): geef minimaal 3-5 items.
- Voor velden met "_instructions": volg de instructies maar verwijder het _instructions veld NIET.
- Datums moeten zo specifiek mogelijk zijn (dag-maand-jaar als beschikbaar).
- Citaten moeten exact en met bron zijn.
- Statistieken moeten een bron hebben.
- Het resultaat wordt gebruikt als basis voor een professioneel YouTube script.

KWALITEITSEISEN:
- Elke claim MOET een bron hebben
- Minimaal 5 key_facts of key_points
- Minimaal 3 events in timeline
- Minimaal 3 statistieken met bronnen
- Alle namen van personen moeten correct gespeld zijn

Geef ALLEEN de ingevulde JSON terug, geen extra tekst ervoor of erna.`;

    const userPrompt = `VIDEO ONDERWERP: ${params.title}

BESCHRIJVING: ${params.description || 'Geen extra beschrijving opgegeven.'}

${params.referenceVideoInfo ? `REFERENTIE INFORMATIE:\n${params.referenceVideoInfo}\n` : ''}

RESEARCH TEMPLATE (vul elk veld volledig in):
${JSON.stringify(params.researchTemplate, null, 2)}

BELANGRIJK: Vul het COMPLETE template in. Elk veld moet ingevuld zijn. Arrays moeten minimaal 3 items bevatten.
Geef ALLEEN de ingevulde JSON terug.`;

    let lastResult: any = null;
    let lastError: string = '';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const promptToUse = attempt === 0 
          ? userPrompt 
          : `${userPrompt}\n\nLET OP: Vorige poging was incompleet. Specifiek: ${lastError}\nZorg dat ALLE velden ingevuld zijn en arrays minimaal 3 items bevatten.`;

        const response = await this.research(systemPrompt, promptToUse);
        const result = this.parseJsonResponse(response);

        // Kwaliteitsvalidatie
        const validation = this.validateResearch(result, params.researchTemplate);
        
        if (validation.isComplete) {
          console.log(`[Perplexity] Research validatie OK (poging ${attempt + 1})`);
          return result;
        }

        lastResult = result;
        lastError = validation.issues.join('; ');
        console.log(`[Perplexity] Research incompleet (poging ${attempt + 1}/${maxRetries + 1}): ${lastError}`);

      } catch (error: any) {
        lastError = error.message;
        console.log(`[Perplexity] Research fout (poging ${attempt + 1}): ${error.message}`);
      }
    }

    // Geef het beste resultaat terug (ook als niet perfect)
    if (lastResult) {
      console.log(`[Perplexity] Research niet 100% compleet, maar best beschikbare resultaat wordt gebruikt`);
      return lastResult;
    }

    throw new Error(`Research mislukt na ${maxRetries + 1} pogingen: ${lastError}`);
  }

  /**
   * Valideer of research resultaat compleet is
   */
  private validateResearch(result: any, template: any): { isComplete: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!result || typeof result !== 'object') {
      return { isComplete: false, issues: ['Geen geldig JSON object'] };
    }

    // Check research_brief bestaat
    const brief = result.research_brief || result;

    // Check key arrays zijn niet leeg
    const arrayChecks = [
      { path: 'key_facts', minItems: 2 },
      { path: 'key_points.points', minItems: 2 },
      { path: 'timeline_of_events.events', minItems: 2 },
      { path: 'chronological_timeline.events', minItems: 2 },
      { path: 'key_players.players', minItems: 1 },
      { path: 'statistics_and_data.figures', minItems: 1 },
      { path: 'statistics_and_facts.figures', minItems: 1 },
      { path: 'sources.primary_sources', minItems: 1 },
    ];

    for (const check of arrayChecks) {
      const value = this.getNestedValue(brief, check.path);
      if (Array.isArray(value)) {
        // Check of items niet leeg zijn
        const nonEmptyItems = value.filter((item: any) => {
          if (typeof item === 'string') return item.trim().length > 0;
          if (typeof item === 'object') {
            return Object.values(item).some((v: any) => 
              v && typeof v === 'string' && v.trim().length > 0 && !v.startsWith('_')
            );
          }
          return true;
        });
        if (nonEmptyItems.length < check.minItems) {
          issues.push(`${check.path}: ${nonEmptyItems.length} items (min ${check.minItems})`);
        }
      }
    }

    // Check of video_metadata ingevuld is
    const metadata = brief.video_metadata;
    if (metadata) {
      if (!metadata.working_title && !metadata.topic_one_sentence) {
        issues.push('video_metadata niet ingevuld');
      }
    }

    return {
      isComplete: issues.length === 0,
      issues,
    };
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // ══════════════════════════════════════════════════
  // STAP 4: TRENDING CLIPS RESEARCH
  // ══════════════════════════════════════════════════

  /**
   * Zoekt actuele, virale video clips voor het onderwerp.
   * Inclusief YouTube URL validatie.
   */
  async executeTrendingClipsResearch(params: {
    title: string;
    description: string;
    researchData?: any;
    usedClips?: { url: string; timesUsed: number }[];
    maxClipDuration: number;
    videoType: string;
    youtubeTranscriptApiKey?: string;
    clipBlueprint?: any;
  }): Promise<any> {
    // Bouw clip type instructies op basis van blueprint
    let clipTypeInstructions = '';
    let targetClipCount = '8-15';
    
    if (params.clipBlueprint) {
      const bp = params.clipBlueprint;
      const taxonomy = bp.clip_taxonomy?.types || [];
      
      if (taxonomy.length > 0) {
        clipTypeInstructions = `\nCLIP TYPES DIE NODIG ZIJN (zoek specifiek naar deze types):`;
        for (const t of taxonomy) {
          const freq = t.frequency || '';
          const dur = t.duration_range_seconds || '';
          clipTypeInstructions += `\n- ${t.type}: ${t.purpose} (duur: ${dur}s, ${freq})`;
        }
      }

      // Bereken target clip count uit blueprint
      if (bp.total_clip_targets?.benchmarks) {
        const benchmark = bp.total_clip_targets.benchmarks[bp.total_clip_targets.benchmarks.length - 1];
        if (benchmark?.clip_count) targetClipCount = benchmark.clip_count;
      }

      if (bp.opening_clip_protocol) {
        clipTypeInstructions += `\n\nOPENING CLIPS: Zoek 2-3 clips die geschikt zijn als cold open. Nieuwsfragmenten, data reveals, expert reacties met urgentie. Korte clips (5-13s) die de kijker direct in het onderwerp trekken.`;
      }

      if (bp.duration_distribution?.bands) {
        clipTypeInstructions += `\n\nGEWENSTE DUUR VERDELING:`;
        for (const band of bp.duration_distribution.bands) {
          clipTypeInstructions += `\n  ${band.range}: ${band.target_percentage} (${band.label})`;
        }
      }
    }

    const systemPrompt = `Je bent een expert video researcher die echte, bestaande YouTube clips zoekt voor professionele YouTube documentaires.

KRITIEKE REGELS:
- Zoek ALLEEN naar ECHTE YouTube video's die JIJ kunt verifiëren dat ze bestaan.
- Geef EXACTE, WERKENDE YouTube URLs (https://www.youtube.com/watch?v=XXXXXXXXXXX formaat)
- Geef exacte timestamps van het relevante fragment
- Maximum clip duur: ${params.maxClipDuration} seconden per clip
- Zoek ${targetClipCount} clips
- Clips moeten RECENT zijn (bij voorkeur laatste 12 maanden)
- VERZIN GEEN URLs. Als je niet zeker bent, geef dan minder clips.
- Rangschik op relevantie + viraliteit
${clipTypeInstructions}

${params.usedClips && params.usedClips.length > 0 ? 
  `EERDER GEBRUIKTE CLIPS (vermijd hergebruik):\n${params.usedClips.map(c => `  ${c.url} (${c.timesUsed}x)`).join('\n')}` : ''}

RESPONSE FORMAT (alleen JSON):
{
  "topic": "onderwerp",
  "clips": [
    {
      "url": "https://www.youtube.com/watch?v=EXACT_VIDEO_ID",
      "title": "Exacte video titel",
      "channel_name": "Kanaal naam",
      "timestamp_start": "MM:SS",
      "timestamp_end": "MM:SS",
      "duration_seconds": 15,
      "clip_type": "OPENER|VALIDATION|FEATURE|FLASH|TRANSITION",
      "relevance_score": 9,
      "virality_score": 8,
      "description": "Wat er te zien is in dit fragment",
      "context_for_script": "Hoe dit in het script past",
      "view_count": "1.2M",
      "publish_date": "2025-02-15"
    }
  ],
  "search_queries_used": ["query1", "query2"],
  "total_clips_found": 12,
  "clip_type_breakdown": {
    "OPENER": 3,
    "VALIDATION": 8,
    "FEATURE": 2,
    "FLASH": 1,
    "TRANSITION": 2
  }
}

Geef ALLEEN de JSON terug.`;

    const researchContext = params.researchData 
      ? JSON.stringify(params.researchData, null, 2).substring(0, 4000)
      : 'Geen research data beschikbaar';

    const userPrompt = `VIDEO ONDERWERP: ${params.title}
BESCHRIJVING: ${params.description}
VIDEO TYPE: ${params.videoType}

RESEARCH CONTEXT:
${researchContext}

Zoek de meest recente, relevante en virale YouTube clips over dit onderwerp.
Geef ALLEEN echte, bestaande URLs. Liever 5 echte clips dan 15 verzonnen clips.`;

    const response = await this.research(systemPrompt, userPrompt);
    const result = this.parseJsonResponse(response);

    // Valideer YouTube URLs
    if (result.clips && Array.isArray(result.clips) && params.youtubeTranscriptApiKey) {
      result.clips = await this.validateYouTubeUrls(result.clips, params.youtubeTranscriptApiKey);
      result.total_clips_found = result.clips.length;
      result.validated = true;
    }

    return result;
  }

  /**
   * Valideer YouTube URLs door te checken of de video's bestaan.
   * Gebruikt YouTube oEmbed (gratis, geen API key nodig) + transcript API als backup
   */
  private async validateYouTubeUrls(
    clips: any[],
    transcriptApiKey: string
  ): Promise<any[]> {
    console.log(`[Perplexity] ${clips.length} YouTube URLs valideren...`);
    
    const validClips: any[] = [];
    const { extractVideoId } = await import('./youtube.js');

    for (const clip of clips) {
      if (!clip.url) continue;

      try {
        // Stap 1: Extraheer video ID (faalt al als URL niet geldig is)
        const videoId = extractVideoId(clip.url);
        
        // Stap 2: Check via oEmbed (gratis, geen API key)
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const oembedResponse = await fetch(oembedUrl, { 
          signal: AbortSignal.timeout(5000) 
        });

        if (oembedResponse.ok) {
          const oembedData = await oembedResponse.json();
          clip.validated = true;
          clip.actual_title = oembedData.title || clip.title;
          clip.actual_channel = oembedData.author_name || clip.channel_name;
          validClips.push(clip);
          console.log(`[Perplexity] ✓ ${videoId}: "${(oembedData.title || '').slice(0, 50)}"`);
        } else {
          console.log(`[Perplexity] ✗ ${videoId}: URL bestaat niet (oEmbed ${oembedResponse.status})`);
          clip.validated = false;
          clip.validation_error = 'Video niet gevonden';
          // Voeg toe met validated=false zodat we het kunnen loggen
        }
      } catch (error: any) {
        console.log(`[Perplexity] ✗ ${clip.url.slice(0, 50)}: ${error.message}`);
        clip.validated = false;
        clip.validation_error = error.message;
      }
    }

    console.log(`[Perplexity] Validatie: ${validClips.length}/${clips.length} clips geldig`);
    return validClips;
  }
}
