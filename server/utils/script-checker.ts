/**
 * AI Script Checker — Automatische kwaliteitscontrole van scripts
 * 
 * Checkt: hook sterkte, pacing, retentie, grammatica, CTA, structuur
 * Output: score 1-10 per categorie + suggesties
 */

const SCRIPT_CHECK_SYSTEM = `Je bent een YouTube script quality analyser. Je beoordeelt scripts op basis van een gestructureerde rubric.

Beoordeel het script op de volgende 7 categorieën (elk 1-10):

1. HOOK (eerste 30 woorden): Trekt het onmiddellijk de aandacht? Creëert het urgentie/nieuwsgierigheid?
2. PACING: Is het ritme goed? Korte zinnen afgewisseld met langere? Geen dode momenten?
3. RETENTIE: Zijn er regelmatig open loops, cliffhangers, pattern interrupts?
4. STRUCTUUR: Logische opbouw? Goede overgang tussen secties? Duidelijk begin-midden-eind?
5. TAALGEBRUIK: Grammatica correct? Natuurlijk sprekend? Geen opvulwoorden?
6. CTA: Is er een duidelijke call-to-action? Past het organisch in het script?
7. ENGAGEMENT: Worden kijkers aangesproken? Is er interactie (vragen, polls, meningen)?

Antwoord ALLEEN in dit exact JSON formaat (geen markdown, geen backticks):
{
  "overall_score": 7.5,
  "categories": {
    "hook": { "score": 8, "feedback": "Korte feedback" },
    "pacing": { "score": 7, "feedback": "Korte feedback" },
    "retention": { "score": 6, "feedback": "Korte feedback" },
    "structure": { "score": 8, "feedback": "Korte feedback" },
    "language": { "score": 9, "feedback": "Korte feedback" },
    "cta": { "score": 5, "feedback": "Korte feedback" },
    "engagement": { "score": 7, "feedback": "Korte feedback" }
  },
  "top_strengths": ["Sterkte 1", "Sterkte 2"],
  "top_improvements": ["Verbetering 1", "Verbetering 2", "Verbetering 3"],
  "rewrite_suggestions": [
    { "original": "Originele zin uit het script", "suggested": "Verbeterde versie", "reason": "Waarom" }
  ]
}`;

export interface ScriptCheckResult {
  overall_score: number;
  categories: Record<string, { score: number; feedback: string }>;
  top_strengths: string[];
  top_improvements: string[];
  rewrite_suggestions: { original: string; suggested: string; reason: string }[];
}

export async function checkScript(
  scriptText: string,
  apiKey: string,
  language: string = 'EN'
): Promise<ScriptCheckResult> {
  const wordCount = scriptText.split(/\s+/).length;
  
  const userPrompt = `Analyseer dit ${language} YouTube script (${wordCount} woorden):

---SCRIPT START---
${scriptText.slice(0, 12000)}
---SCRIPT END---

Geef je beoordeling in het gevraagde JSON formaat. Schrijf feedback in het ${language === 'NL' ? 'Nederlands' : 'Engels'}.`;

  const response = await fetch('https://chat-api.elevate.uno/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4.5',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SCRIPT_CHECK_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Script check API error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  // Parse JSON uit response (strip eventuele markdown backticks)
  const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  try {
    const result = JSON.parse(cleaned);
    return result as ScriptCheckResult;
  } catch {
    throw new Error(`Script check: kon JSON niet parsen. Response: ${cleaned.slice(0, 300)}`);
  }
}
