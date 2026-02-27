import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { NexLevService, buildChannelSummary } from '../services/nexlev.js';

const router = Router();

// ── Helper: haal settings op ──
async function getSettings() {
  return prisma.settings.findUnique({ where: { id: 'singleton' } });
}

// ── Helper: NexLev service aanmaken ──
async function getNexLev(): Promise<NexLevService> {
  const settings = await getSettings();
  if (!settings?.n8nBaseUrl) throw new Error('N8N Base URL niet geconfigureerd in Settings');
  return new NexLevService({
    n8nBaseUrl: settings.n8nBaseUrl,
    nexlevApiKey: settings.nexlevApiKey || '',
  });
}

// ── Helper: Elevate Chat API call ──
async function elevateLLM(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://chat-api.elevate.uno/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4.5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Elevate LLM fout (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ══════════════════════════════════════════════════
// POST /api/ideation/brainstorm
// Haal NexLev data op → LLM genereert ideeën
// ══════════════════════════════════════════════════
router.post('/brainstorm', async (req: Request, res: Response) => {
  try {
    const { channelId } = req.body;
    if (!channelId) return res.status(400).json({ error: 'channelId is verplicht' });

    const channel = await prisma.channel.findUnique({ where: { id: channelId as string } });
    if (!channel) return res.status(404).json({ error: 'Kanaal niet gevonden' });

    const settings = await getSettings();
    if (!settings?.elevateApiKey) return res.status(400).json({ error: 'Elevate API key niet geconfigureerd' });

    // YouTube channel ID nodig voor NexLev
    if (!channel.youtubeChannelId) {
      return res.status(400).json({ error: 'YouTube Channel ID niet ingesteld voor dit kanaal. Stel dit in bij Kanalen.' });
    }

    const nexlev = await getNexLev();

    // Parallel NexLev data ophalen
    console.log(`[Ideation] Brainstorm voor kanaal: ${channel.name} (${channel.youtubeChannelId})`);

    const [about, videos, outliers, analytics] = await Promise.allSettled([
      nexlev.getChannelAbout(channel.youtubeChannelId),
      nexlev.getChannelVideos(channel.youtubeChannelId),
      nexlev.getChannelOutliers(channel.youtubeChannelId),
      nexlev.getAnalytics(channel.youtubeChannelId),
    ]);

    // Competitor outliers ophalen
    const competitors: string[] = JSON.parse(channel.competitors || '[]');
    let competitorOutliers: any[] = [];

    if (competitors.length > 0) {
      const compResults = await Promise.allSettled(
        competitors.slice(0, 5).map(compId => nexlev.getChannelOutliers(compId))
      );
      competitorOutliers = compResults
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<any>).value)
        .flat();
    }

    // Bouw channel summary
    const channelSummary = buildChannelSummary({
      about: about.status === 'fulfilled' ? about.value : null,
      videos: videos.status === 'fulfilled' ? videos.value : null,
      outliers: outliers.status === 'fulfilled' ? outliers.value : null,
      analytics: analytics.status === 'fulfilled' ? analytics.value : null,
      competitorOutliers: competitorOutliers.length > 0 ? competitorOutliers : undefined,
    });

    // LLM Brainstorm
    const systemPrompt = `Je bent een expert YouTube content strateeg. Je analyseert kanaaldata en bedenkt virale video-ideeën.

Je krijgt uitgebreide kanaaldata: analytics, recente videos, outlier videos (bovengemiddeld presterend), en competitor data.

Genereer precies 8 video-ideeën. Elk idee moet:
- Inspelen op bewezen patronen (outliers = wat werkt)
- Rekening houden met het kanaalthema en doelgroep
- Mix van veilige keuzes (bewezen formules) en creatieve risico's
- Specifiek genoeg zijn om direct als project te starten

Geef je antwoord als JSON array met exact deze structuur:
[
  {
    "title": "Video titel (pakkend, YouTube-waardig)",
    "description": "Korte beschrijving van het idee (2-3 zinnen)",
    "angle": "De specifieke invalshoek/hook",
    "videoType": "ai|spokesperson_ai|trending|documentary|compilation|spokesperson",
    "referenceVideos": ["https://youtube.com/watch?v=..."],
    "confidence": "high|medium|low",
    "reasoning": "Waarom dit idee goed is voor dit kanaal (1 zin)"
  }
]

Geef ALLEEN de JSON array terug, geen extra tekst.`;

    const userPrompt = `Kanaal: ${channel.name}
Beschrijving: ${channel.description || 'Geen beschrijving'}
Default video type: ${channel.defaultVideoType}
Extra stijl instructies: ${channel.styleExtraInstructions || 'Geen'}

${channelSummary}`;

    console.log(`[Ideation] LLM brainstorm starten...`);
    const llmResponse = await elevateLLM(systemPrompt, userPrompt, settings.elevateApiKey);

    // Parse JSON uit LLM response
    let ideas: any[];
    try {
      // Probeer direct te parsen
      ideas = JSON.parse(llmResponse);
    } catch {
      // Probeer JSON uit markdown code block te halen
      const match = llmResponse.match(/\[[\s\S]*\]/);
      if (match) {
        ideas = JSON.parse(match[0]);
      } else {
        throw new Error('LLM response bevat geen geldige JSON');
      }
    }

    if (!Array.isArray(ideas)) throw new Error('LLM response is geen array');

    console.log(`[Ideation] ${ideas.length} ideeën gegenereerd`);

    res.json({
      success: true,
      ideas: ideas.map((idea: any, idx: number) => ({
        tempId: `brainstorm-${Date.now()}-${idx}`,
        title: idea.title || 'Untitled',
        description: idea.description || '',
        angle: idea.angle || '',
        videoType: idea.videoType || channel.defaultVideoType,
        referenceVideos: idea.referenceVideos || [],
        confidence: idea.confidence || 'medium',
        reasoning: idea.reasoning || '',
        source: 'ai',
      })),
      dataStats: {
        aboutLoaded: about.status === 'fulfilled',
        videosLoaded: videos.status === 'fulfilled',
        outliersLoaded: outliers.status === 'fulfilled',
        analyticsLoaded: analytics.status === 'fulfilled',
        competitorsAnalyzed: competitorOutliers.length,
      },
    });
  } catch (error: any) {
    console.error('[Ideation] Brainstorm error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
// GET /api/ideation/ideas?channelId=...
// Lijst opgeslagen ideeën
// ══════════════════════════════════════════════════
router.get('/ideas', async (req: Request, res: Response) => {
  try {
    const where: any = {};
    if (req.query.channelId) where.channelId = req.query.channelId as string;

    const ideas = await prisma.idea.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { channel: { select: { name: true } } },
    });

    res.json(ideas);
  } catch (error: any) {
    console.error('GET /ideation/ideas error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
// POST /api/ideation/ideas
// Idee opslaan (handmatig of vanuit brainstorm)
// ══════════════════════════════════════════════════
router.post('/ideas', async (req: Request, res: Response) => {
  try {
    const { channelId, title, description, angle, videoType, referenceVideos, confidence, reasoning, source } = req.body;

    if (!channelId || !title) return res.status(400).json({ error: 'channelId en title zijn verplicht' });

    const idea = await prisma.idea.create({
      data: {
        channelId: channelId as string,
        title,
        description: description || '',
        angle: angle || '',
        videoType: videoType || 'ai',
        referenceVideos: JSON.stringify(referenceVideos || []),
        confidence: confidence || 'medium',
        reasoning: reasoning || '',
        source: source || 'manual',
        status: 'saved',
      },
    });

    res.status(201).json(idea);
  } catch (error: any) {
    console.error('POST /ideation/ideas error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
// PUT /api/ideation/ideas/:id
// Idee bewerken
// ══════════════════════════════════════════════════
router.put('/ideas/:id', async (req: Request, res: Response) => {
  try {
    const { title, description, angle, videoType, referenceVideos, status } = req.body;

    const idea = await prisma.idea.update({
      where: { id: req.params.id as string },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(angle !== undefined && { angle }),
        ...(videoType !== undefined && { videoType }),
        ...(referenceVideos !== undefined && { referenceVideos: JSON.stringify(referenceVideos) }),
        ...(status !== undefined && { status }),
      },
    });

    res.json(idea);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Idee niet gevonden' });
    console.error('PUT /ideation/ideas/:id error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
// DELETE /api/ideation/ideas/:id
// Idee verwijderen
// ══════════════════════════════════════════════════
router.delete('/ideas/:id', async (req: Request, res: Response) => {
  try {
    await prisma.idea.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Idee niet gevonden' });
    console.error('DELETE /ideation/ideas/:id error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
// POST /api/ideation/convert/:ideaId
// Idee omzetten naar een nieuw Project
// ══════════════════════════════════════════════════
router.post('/convert/:ideaId', async (req: Request, res: Response) => {
  try {
    const idea = await prisma.idea.findUnique({
      where: { id: req.params.ideaId as string },
      include: { channel: true },
    });
    if (!idea) return res.status(404).json({ error: 'Idee niet gevonden' });

    const refVideos: string[] = JSON.parse(idea.referenceVideos || '[]');

    // Genereer project naam (slugified title)
    const projectName = idea.title
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);

    // Maak project aan met idee data
    const project = await prisma.project.create({
      data: {
        name: projectName,
        title: idea.title,
        description: idea.description,
        videoType: idea.videoType || 'ai',
        channelId: idea.channelId,
        config: JSON.stringify({
          language: 'EN',
          scriptSource: 'new',
          referenceVideos: refVideos,
          scriptLength: 5000,
          voice: idea.channel?.name || 'Default',
          backgroundMusic: true,
          visualStyle: 'ai-3d-render',
          stockImages: true,
          colorGrading: 'Geen',
          subtitles: false,
          output: 'YouTube 1080p',
          aspectRatio: 'landscape',
          useClips: false,
          checkpoints: [3, 4, 6, 9],
          enabledSteps: [],
          imageSelectionMode: 'auto',
          imagesPerScene: 1,
          transitionMode: 'uniform',
          uniformTransition: 'cross-dissolve',
        }),
        status: 'draft',
      },
    });

    // Update idee status
    await prisma.idea.update({
      where: { id: idea.id },
      data: { status: 'converted', projectId: project.id },
    });

    console.log(`[Ideation] Idee "${idea.title}" omgezet naar project ${project.id}`);

    res.json({ success: true, projectId: project.id });
  } catch (error: any) {
    console.error('POST /ideation/convert error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
// GET /api/ideation/similar-channels/:channelId
// Zoek vergelijkbare kanalen via NexLev
// ══════════════════════════════════════════════════
router.get('/similar-channels/:channelId', async (req: Request, res: Response) => {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId as string } });
    if (!channel) return res.status(404).json({ error: 'Kanaal niet gevonden' });
    if (!channel.youtubeChannelId) return res.status(400).json({ error: 'YouTube Channel ID niet ingesteld' });

    const nexlev = await getNexLev();
    const result = await nexlev.getSimilarChannels(channel.youtubeChannelId);

    res.json({ success: true, channels: result });
  } catch (error: any) {
    console.error('GET /ideation/similar-channels error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
