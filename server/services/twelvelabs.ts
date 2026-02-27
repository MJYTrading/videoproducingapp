/**
 * TwelveLabs Service — Video content analyse en validatie
 * 
 * Gebruikt voor:
 * - Validatie of gedownloade footage visueel aansluit bij de scene
 * - Video search in bestaande content
 * - Content beschrijving genereren voor Clip Library
 */

const TWELVELABS_URL = 'https://api.twelvelabs.io/v1.2';

interface TwelveLabsConfig {
  apiKey: string;
}

export class TwelveLabsService {
  private apiKey: string;

  constructor(config: TwelveLabsConfig) {
    this.apiKey = config.apiKey;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const response = await fetch(`${TWELVELABS_URL}${endpoint}`, {
      ...options,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TwelveLabs API fout (${response.status}): ${text.slice(0, 200)}`);
    }

    return response.json();
  }

  /**
   * Valideer of een video fragment past bij de gewenste scene beschrijving
   * Returns een score van 0-1
   */
  async validateContent(params: {
    videoUrl: string;
    expectedDescription: string;
    indexId?: string;
  }): Promise<{ score: number; description: string; matches: boolean }> {
    try {
      // Gebruik de generate endpoint voor video beschrijving
      const result = await this.request('/generate', {
        method: 'POST',
        body: JSON.stringify({
          video_url: params.videoUrl,
          prompt: `Beschrijf kort wat er te zien is in deze video. Is dit een goede match voor: "${params.expectedDescription}"? Geef een score van 0-10.`,
        }),
      });

      const description = result.data || result.text || '';
      
      // Probeer een score te extraheren uit het antwoord
      const scoreMatch = description.match(/(\d+)\s*\/?\s*10/);
      const score = scoreMatch ? parseInt(scoreMatch[1]) / 10 : 0.5;

      return {
        score,
        description: description.slice(0, 500),
        matches: score >= 0.6,
      };
    } catch (error: any) {
      console.log(`[TwelveLabs] Validatie fout (niet-kritiek): ${error.message}`);
      // Bij fout: geef neutrale score terug (niet blokkeren)
      return { score: 0.5, description: 'Validatie niet beschikbaar', matches: true };
    }
  }

  /**
   * Genereer tags en beschrijving voor een video (voor Clip Library)
   */
  async analyzeVideo(videoUrl: string): Promise<{
    description: string;
    tags: string[];
    category: string;
    mood: string;
    subjects: string[];
  }> {
    try {
      const result = await this.request('/generate', {
        method: 'POST',
        body: JSON.stringify({
          video_url: videoUrl,
          prompt: `Analyseer deze video en geef terug als JSON:
{
  "description": "korte beschrijving",
  "tags": ["tag1", "tag2", "tag3"],
  "category": "news|nature|technology|sports|politics|entertainment|education|other",
  "mood": "dramatic|calm|energetic|serious|humorous|neutral",
  "subjects": ["onderwerp1", "onderwerp2"]
}
Geef ALLEEN de JSON terug.`,
        }),
      });

      const text = result.data || result.text || '';
      try {
        const parsed = JSON.parse(text);
        return {
          description: parsed.description || '',
          tags: parsed.tags || [],
          category: parsed.category || 'other',
          mood: parsed.mood || 'neutral',
          subjects: parsed.subjects || [],
        };
      } catch {
        return {
          description: text.slice(0, 200),
          tags: [],
          category: 'other',
          mood: 'neutral',
          subjects: [],
        };
      }
    } catch (error: any) {
      console.log(`[TwelveLabs] Analyse fout: ${error.message}`);
      return {
        description: 'Analyse niet beschikbaar',
        tags: [],
        category: 'other',
        mood: 'neutral',
        subjects: [],
      };
    }
  }

  /**
   * Check of de API key werkt
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.request('/indexes?page=1&page_limit=1');
      return true;
    } catch {
      return false;
    }
  }
}
