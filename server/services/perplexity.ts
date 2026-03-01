/**
 * Research Service v3 — Elevate Sonar + Claude twee-staps aanpak
 * 
 * Stap 1: sonar-deep-research doet het onderzoek (vrije tekst)
 * Stap 2: claude-sonnet-4.5 structureert de tekst in JSON
 * 
 * Dit voorkomt JSON parse errors omdat elk model doet waar het goed in is.
 */

const ELEVATE_CHAT_URL = 'https://chat-api.elevate.uno/v1/chat/completions';

interface PerplexityConfig {
  apiKey: string;
  model?: string;
  structureModel?: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class PerplexityService {
  private apiKey: string;
  private researchModel: string;
  private structureModel: string;

  constructor(config: PerplexityConfig) {
    this.apiKey = config.apiKey;
    this.researchModel = config.model || 'sonar-deep-research';
    this.structureModel = config.structureModel || 'claude-sonnet-4.5';
  }

  // ─── Core API call ───
  private async chatCompletion(model: string, messages: ChatMessage[], maxTokens?: number): Promise<string> {
    console.log(`[Research] API call → ${model} (${messages.length} messages)...`);

    const body: any = { model, messages };
    if (maxTokens) body.max_tokens = maxTokens;

    const response = await fetch(ELEVATE_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Elevate API fout (${response.status}): ${text.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    console.log(`[Research] Response van ${model}: ${content.length} chars`);
    return content;
  }

  // ─── Legacy compatibility: research() method ───
  async research(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.chatCompletion(this.researchModel, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
  }

  // ─── JSON parsing (meerdere strategieën) ───
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

  // ─── Structureer tekst naar JSON via Claude ───
  private async structureToJson(researchText: string, jsonTemplate: any, context: string): Promise<any> {
    const systemPrompt = `Je bent een data-structurering specialist. Je krijgt onderzoeksresultaten als vrije tekst en een JSON template.

JE TAAK: Vul het JSON template in met informatie uit het onderzoek.

REGELS:
- Geef ALLEEN valid JSON terug, geen tekst ervoor of erna
- Begin je response met { en eindig met }
- Vul ALLE velden in het template in
- Voor arrays: geef minimaal 3-5 items
- Gebruik alleen informatie uit het aangeleverde onderzoek
- Behoud bronvermeldingen waar mogelijk
- Velden met "_instructions": volg de instructies maar laat het veld staan
- Als informatie niet beschikbaar is in het onderzoek, vul dan "Niet gevonden in onderzoek" in

KWALITEITSEISEN:
- Minimaal 5 key_facts of key_points
- Minimaal 3 events in timeline
- Minimaal 3 statistieken
- Correcte spelling van namen`;

    const userPrompt = `CONTEXT: ${context}

ONDERZOEKSRESULTATEN:
${researchText}

JSON TEMPLATE (vul volledig in):
${JSON.stringify(jsonTemplate, null, 2)}

Geef ALLEEN de ingevulde JSON terug.`;

    // Claude is betrouwbaar voor JSON — max 2 retries
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.chatCompletion(this.structureModel, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ], 16000);

        return this.parseJsonResponse(response);
      } catch (error: any) {
        console.log(`[Research] JSON structurering poging ${attempt + 1} mislukt: ${error.message}`);
        if (attempt === 2) throw error;
      }
    }

    throw new Error('JSON structurering mislukt na 3 pogingen');
  }

  // ══════════════════════════════════════════════════
  // STAP 2: RESEARCH JSON (twee-staps)
  // ══════════════════════════════════════════════════

  async executeResearch(params: {
    title: string;
    description: string;
    researchTemplate: any;
    referenceVideoInfo?: string;
    maxRetries?: number;
  }): Promise<any> {
    const maxRetries = params.maxRetries ?? 1;

    // ─── STAP 1: Deep Research (vrije tekst) ───
    console.log(`[Research] Stap 1: Deep research via ${this.researchModel}...`);

    const researchSystemPrompt = `Je bent een diepgaande researcher voor YouTube video productie.
Doe uitgebreid onderzoek over het opgegeven onderwerp en geef een zo compleet mogelijk rapport.

VEREISTEN:
- Gebruik geverifieerde, feitelijke informatie
- Geef bronvermeldingen bij claims [1], [2], etc.
- Behandel: achtergrond, timeline van events, belangrijkste feiten, betrokken personen, statistieken, citaten, impact/gevolgen
- Wees zo specifiek mogelijk: exacte datums, namen, cijfers
- Minimaal 5 key facts
- Minimaal 3 events met datums
- Minimaal 3 statistieken met bronnen
- Alle relevante personen met hun rol

Dit onderzoek wordt gebruikt als basis voor een professioneel YouTube script.`;

    const researchUserPrompt = `VIDEO ONDERWERP: ${params.title}

BESCHRIJVING: ${params.description || 'Geen extra beschrijving opgegeven.'}

${params.referenceVideoInfo ? `REFERENTIE INFORMATIE:\n${params.referenceVideoInfo}\n` : ''}

Geef een uitgebreid en gedetailleerd onderzoeksrapport over dit onderwerp.`;

    let researchText = '';
    try {
      researchText = await this.chatCompletion(this.researchModel, [
        { role: 'system', content: researchSystemPrompt },
        { role: 'user', content: researchUserPrompt },
      ]);

      if (researchText.length < 200) {
        throw new Error(`Research response te kort: ${researchText.length} chars`);
      }

      console.log(`[Research] Stap 1 compleet: ${researchText.length} chars onderzoek ontvangen`);
    } catch (error: any) {
      throw new Error(`Deep research mislukt: ${error.message}`);
    }

    // ─── STAP 2: Structureer naar JSON ───
    console.log(`[Research] Stap 2: Structurering naar JSON via ${this.structureModel}...`);

    let lastResult: any = null;
    let lastError: string = '';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.structureToJson(
          researchText,
          params.researchTemplate,
          `Video: ${params.title}`
        );

        // Kwaliteitsvalidatie
        const validation = this.validateResearch(result, params.researchTemplate);

        if (validation.isComplete) {
          console.log(`[Research] Stap 2 compleet: JSON validatie OK (poging ${attempt + 1})`);
          result._researchLength = researchText.length;
          result._model = this.researchModel;
          result._structureModel = this.structureModel;
          return result;
        }

        lastResult = result;
        lastError = validation.issues.join('; ');
        console.log(`[Research] JSON incompleet (poging ${attempt + 1}): ${lastError}`);

      } catch (error: any) {
        lastError = error.message;
        console.log(`[Research] Structurering fout (poging ${attempt + 1}): ${error.message}`);
      }
    }

    // Geef het beste resultaat terug (ook als niet 100% perfect)
    if (lastResult) {
      console.log(`[Research] Niet 100% compleet, maar best beschikbare resultaat wordt gebruikt`);
      lastResult._researchLength = researchText.length;
      lastResult._model = this.researchModel;
      lastResult._structureModel = this.structureModel;
      lastResult._incomplete = true;
      return lastResult;
    }

    throw new Error(`Research structurering mislukt na ${maxRetries + 1} pogingen: ${lastError}`);
  }

  // ─── Research validatie ───
  private validateResearch(result: any, template: any): { isComplete: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!result || typeof result !== 'object') {
      return { isComplete: false, issues: ['Geen geldig JSON object'] };
    }

    const brief = result.research_brief || result;

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

    const metadata = brief.video_metadata;
    if (metadata) {
      if (!metadata.working_title && !metadata.topic_one_sentence) {
        issues.push('video_metadata niet ingevuld');
      }
    }

    return { isComplete: issues.length === 0, issues };
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // ══════════════════════════════════════════════════
  // STAP 4: TRENDING CLIPS RESEARCH (twee-staps)
  // ══════════════════════════════════════════════════

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
        clipTypeInstructions = `\nCLIP TYPES DIE NODIG ZIJN:`;
        for (const t of taxonomy) {
          const freq = t.frequency || '';
          const dur = t.duration_range_seconds || '';
          clipTypeInstructions += `\n- ${t.type}: ${t.purpose} (duur: ${dur}s, ${freq})`;
        }
      }

      if (bp.total_clip_targets?.benchmarks) {
        const benchmark = bp.total_clip_targets.benchmarks[bp.total_clip_targets.benchmarks.length - 1];
        if (benchmark?.clip_count) targetClipCount = benchmark.clip_count;
      }

      if (bp.opening_clip_protocol) {
        clipTypeInstructions += `\n\nOPENING CLIPS: Zoek 2-3 clips die geschikt zijn als cold open.`;
      }

      if (bp.duration_distribution?.bands) {
        clipTypeInstructions += `\n\nGEWENSTE DUUR VERDELING:`;
        for (const band of bp.duration_distribution.bands) {
          clipTypeInstructions += `\n  ${band.range}: ${band.target_percentage} (${band.label})`;
        }
      }
    }

    // ─── STAP 1: Sonar zoekt clips (vrije tekst) ───
    console.log(`[Research] Clips stap 1: Zoeken via ${this.researchModel}...`);

    const researchContext = params.researchData
      ? JSON.stringify(params.researchData, null, 2).substring(0, 4000)
      : 'Geen research data beschikbaar';

    const searchSystemPrompt = `Je bent een expert video researcher die echte, bestaande YouTube clips zoekt.

KRITIEKE REGELS:
- Zoek ALLEEN naar ECHTE YouTube video's die je kunt verifiëren
- Geef EXACTE YouTube URLs (https://www.youtube.com/watch?v=XXXXXXXXXXX)
- Geef timestamps van relevante fragmenten
- Maximum clip duur: ${params.maxClipDuration} seconden per clip
- Zoek ${targetClipCount} clips
- Clips moeten RECENT zijn (bij voorkeur laatste 12 maanden)
- VERZIN GEEN URLs. Als je niet zeker bent, geef minder clips.
${clipTypeInstructions}

${params.usedClips && params.usedClips.length > 0 ?
      `EERDER GEBRUIKTE CLIPS (vermijd):\n${params.usedClips.map(c => `  ${c.url} (${c.timesUsed}x)`).join('\n')}` : ''}

Geef voor elke clip: URL, titel, kanaal, timestamps, duur, type, relevantie, beschrijving.`;

    const searchUserPrompt = `VIDEO ONDERWERP: ${params.title}
BESCHRIJVING: ${params.description}
VIDEO TYPE: ${params.videoType}

RESEARCH CONTEXT:
${researchContext}

Zoek de meest recente, relevante en virale YouTube clips over dit onderwerp.`;

    let clipSearchText = '';
    try {
      clipSearchText = await this.chatCompletion(this.researchModel, [
        { role: 'system', content: searchSystemPrompt },
        { role: 'user', content: searchUserPrompt },
      ]);

      console.log(`[Research] Clips stap 1 compleet: ${clipSearchText.length} chars`);
    } catch (error: any) {
      throw new Error(`Clips research mislukt: ${error.message}`);
    }

    // ─── STAP 2: Structureer naar JSON ───
    console.log(`[Research] Clips stap 2: Structurering via ${this.structureModel}...`);

    const structurePrompt = `Structureer de volgende clip research resultaten in exact dit JSON format.

VEREISTEN:
- Behoud ALLE YouTube URLs exact zoals ze in het onderzoek staan
- Behoud timestamps exact
- Begin je response met { en eindig met }
- Geef ALLEEN valid JSON terug

JSON FORMAT:
{
  "topic": "onderwerp",
  "clips": [
    {
      "url": "https://www.youtube.com/watch?v=EXACT_ID",
      "title": "Exacte video titel",
      "channel_name": "Kanaal naam",
      "timestamp_start": "MM:SS",
      "timestamp_end": "MM:SS",
      "duration_seconds": 15,
      "clip_type": "OPENER|VALIDATION|FEATURE|FLASH|TRANSITION",
      "relevance_score": 9,
      "virality_score": 8,
      "description": "Wat er te zien is",
      "context_for_script": "Hoe dit in het script past",
      "view_count": "1.2M",
      "publish_date": "2025-02-15"
    }
  ],
  "search_queries_used": ["query1"],
  "total_clips_found": 12,
  "clip_type_breakdown": {}
}`;

    let result: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.chatCompletion(this.structureModel, [
          { role: 'system', content: structurePrompt },
          { role: 'user', content: `CLIP RESEARCH RESULTATEN:\n${clipSearchText}\n\nStructureer dit in het gevraagde JSON format.` },
        ], 16000);

        result = this.parseJsonResponse(response);
        break;
      } catch (error: any) {
        console.log(`[Research] Clips JSON poging ${attempt + 1} mislukt: ${error.message}`);
        if (attempt === 2) throw new Error(`Clips JSON structurering mislukt: ${error.message}`);
      }
    }

    // Valideer YouTube URLs
    if (result.clips && Array.isArray(result.clips)) {
      result.clips = await this.validateYouTubeUrls(result.clips);
      result.total_clips_found = result.clips.length;
      result.validated = true;
    }

    result._model = this.researchModel;
    result._structureModel = this.structureModel;
    return result;
  }

  // ─── YouTube URL validatie via oEmbed ───
  private async validateYouTubeUrls(clips: any[]): Promise<any[]> {
    console.log(`[Research] ${clips.length} YouTube URLs valideren...`);

    const validClips: any[] = [];
    const { extractVideoId } = await import('./youtube.js');

    for (const clip of clips) {
      if (!clip.url) continue;

      try {
        const videoId = extractVideoId(clip.url);

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
          console.log(`[Research] ✓ ${videoId}: "${(oembedData.title || '').slice(0, 50)}"`);
        } else {
          console.log(`[Research] ✗ ${videoId}: niet gevonden (${oembedResponse.status})`);
        }
      } catch (error: any) {
        console.log(`[Research] ✗ ${clip.url.slice(0, 50)}: ${error.message}`);
      }
    }

    console.log(`[Research] Validatie: ${validClips.length}/${clips.length} clips geldig`);
    return validClips;
  }
}
