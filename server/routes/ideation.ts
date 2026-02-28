import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { NexLevService } from '../services/nexlev.js';

const router = Router();

// ── Helpers ──

async function getSettings() {
  return prisma.settings.findUnique({ where: { id: 'singleton' } });
}

async function getNexLev(): Promise<NexLevService> {
  const settings = await getSettings();
  if (!settings?.n8nBaseUrl) throw new Error('N8N Base URL niet geconfigureerd in Settings');
  return new NexLevService({ n8nBaseUrl: settings.n8nBaseUrl, nexlevApiKey: '' });
}

async function getChannelYtId(channelId: string): Promise<string> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error('Kanaal niet gevonden');
  if (!channel.youtubeChannelId) throw new Error('YouTube Channel ID niet ingesteld');
  return channel.youtubeChannelId;
}

async function elevateLLM(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://chat-api.elevate.uno/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4.5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8, max_tokens: 4096,
    }),
  });
  if (!response.ok) throw new Error(`Elevate LLM fout (${response.status})`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ══════════════════════════════════════════════════════════
// NEXLEV CACHE SYSTEM
// Slaat data op per channelId + endpoint
// Geeft cached data terug tenzij ?refresh=true
// ══════════════════════════════════════════════════════════

async function getCachedOrFetch(
  channelId: string,
  endpoint: string,
  fetchFn: () => Promise<any>,
  forceRefresh: boolean = false
): Promise<{ data: any; cached: boolean; fetchedAt: string }> {
  // Check cache
  if (!forceRefresh) {
    const cached = await prisma.nexLevCache.findUnique({
      where: { channelId_endpoint: { channelId, endpoint } },
    });
    if (cached) {
      console.log(`[NexLev] Cache HIT: ${endpoint} voor ${channelId.slice(0, 15)}`);
      return { data: JSON.parse(cached.data), cached: true, fetchedAt: cached.fetchedAt.toISOString() };
    }
  }

  // Fetch fresh
  console.log(`[NexLev] ${forceRefresh ? 'REFRESH' : 'Cache MISS'}: ${endpoint} voor ${channelId.slice(0, 15)}`);
  const data = await fetchFn();

  // Save to cache
  await prisma.nexLevCache.upsert({
    where: { channelId_endpoint: { channelId, endpoint } },
    create: { channelId, endpoint, data: JSON.stringify(data) },
    update: { data: JSON.stringify(data), fetchedAt: new Date() },
  });

  return { data, cached: false, fetchedAt: new Date().toISOString() };
}

// ══════════════════════════════════════════════════════════
// NEXLEV ON-DEMAND ENDPOINTS (cached)
// ?refresh=true forceert een nieuwe API call (1 credit)
// ══════════════════════════════════════════════════════════

const channelEndpoints: Record<string, (nexlev: NexLevService, ytId: string) => Promise<any>> = {
  'about':          (n, id) => n.getChannelAbout(id),
  'videos':         (n, id) => n.getChannelVideos(id),
  'shorts':         (n, id) => n.getChannelShorts(id),
  'outliers':       (n, id) => n.getChannelOutliers(id),
  'analytics':      (n, id) => n.getAnalytics(id),
  'demographics':   (n, id) => n.getDemographics(id),
  'short-vs-long':  (n, id) => n.getShortVsLong(id),
  'similar-channels': (n, id) => n.getSimilarChannels(id),
  'niche':          (n, id) => n.getNicheAnalysis(id),
  'playlists':      (n, id) => n.getChannelPlaylists(id),
};

// Generic cached channel endpoint
// ?refresh=true -> force new API call (1 credit)
// ?cacheOnly=true -> only return cached data, never fetch
router.get('/nexlev/:endpoint/:channelId', async (req: Request, res: Response) => {
  try {
    const { endpoint, channelId } = req.params;
    const refresh = req.query.refresh === 'true';
    const cacheOnly = req.query.cacheOnly === 'true';

    const fetchFn = channelEndpoints[endpoint as string];
    if (!fetchFn) return res.status(400).json({ error: `Onbekend endpoint: ${endpoint}` });

    // Cache-only mode: return cached data or 204
    if (cacheOnly) {
      const cached = await prisma.nexLevCache.findUnique({
        where: { channelId_endpoint: { channelId: channelId as string, endpoint: endpoint as string } },
      });
      if (cached) {
        return res.json({ success: true, data: JSON.parse(cached.data), cached: true, fetchedAt: cached.fetchedAt.toISOString() });
      }
      return res.status(204).send();
    }

    const ytId = await getChannelYtId(channelId as string);
    const nexlev = await getNexLev();

    const result = await getCachedOrFetch(channelId as string, endpoint as string, () => fetchFn(nexlev, ytId), refresh);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error(`[NexLev] ${req.params.endpoint} error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST endpoints (video-based, no channel cache)
router.post('/nexlev/video-details', async (req: Request, res: Response) => {
  try {
    const { videoId } = req.body;
    if (!videoId) return res.status(400).json({ error: 'videoId is verplicht' });
    const nexlev = await getNexLev();
    res.json({ success: true, data: await nexlev.getVideoDetails(videoId) });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/nexlev/video-comments', async (req: Request, res: Response) => {
  try {
    const { videoId } = req.body;
    if (!videoId) return res.status(400).json({ error: 'videoId is verplicht' });
    const nexlev = await getNexLev();
    res.json({ success: true, data: await nexlev.getVideoComments(videoId) });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/nexlev/video-transcript', async (req: Request, res: Response) => {
  try {
    const { videoId } = req.body;
    if (!videoId) return res.status(400).json({ error: 'videoId is verplicht' });
    const nexlev = await getNexLev();
    res.json({ success: true, data: await nexlev.getVideoTranscript(videoId) });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/nexlev/similar-videos', async (req: Request, res: Response) => {
  try {
    const { videoId } = req.body;
    if (!videoId) return res.status(400).json({ error: 'videoId is verplicht' });
    const nexlev = await getNexLev();
    res.json({ success: true, data: await nexlev.getSimilarVideos(videoId) });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// Direct YT channel ID call (for competitors)
router.post('/nexlev/direct-channel', async (req: Request, res: Response) => {
  try {
    const { ytChannelId, endpoint } = req.body;
    if (!ytChannelId || !endpoint) return res.status(400).json({ error: 'ytChannelId en endpoint verplicht' });
    const fetchFn = channelEndpoints[endpoint];
    if (!fetchFn) return res.status(400).json({ error: `Onbekend endpoint: ${endpoint}` });
    const nexlev = await getNexLev();
    // Cache per ytChannelId
    const result = await getCachedOrFetch(ytChannelId, endpoint, () => fetchFn(nexlev, ytChannelId), req.body.refresh === true);
    res.json({ success: true, ...result });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ══════════════════════════════════════════════════════════
// COMPETITORS CRUD
// ══════════════════════════════════════════════════════════

router.get('/competitors/:channelId', async (req: Request, res: Response) => {
  try {
    const competitors = await prisma.competitor.findMany({
      where: { channelId: req.params.channelId as string },
      orderBy: { createdAt: 'desc' },
    });
    res.json(competitors);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/competitors', async (req: Request, res: Response) => {
  try {
    const { channelId, ytChannelId, name, notes } = req.body;
    if (!channelId || !ytChannelId) return res.status(400).json({ error: 'channelId en ytChannelId verplicht' });

    // Fetch about to get name + cache it
    let channelName = name || '';
    try {
      const nexlev = await getNexLev();
      const aboutData = await nexlev.getChannelAbout(ytChannelId);
      const d = Array.isArray(aboutData) ? aboutData[0] : aboutData;
      channelName = d?.title || d?.channelName || ytChannelId;
      // Cache the about data
      await prisma.nexLevCache.upsert({
        where: { channelId_endpoint: { channelId: ytChannelId, endpoint: 'about' } },
        create: { channelId: ytChannelId, endpoint: 'about', data: JSON.stringify(aboutData) },
        update: { data: JSON.stringify(aboutData), fetchedAt: new Date() },
      });
    } catch (e) { console.log('[Competitor] Could not fetch about:', (e as any).message); }

    const competitor = await prisma.competitor.create({
      data: { channelId, ytChannelId, name: channelName, notes: notes || '' },
    });
    res.status(201).json(competitor);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Competitor bestaat al' });
    res.status(500).json({ error: error.message });
  }
});

router.delete('/competitors/:id', async (req: Request, res: Response) => {
  try {
    await prisma.competitor.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ══════════════════════════════════════════════════════════
// BRAINSTORM (with research context)
// ══════════════════════════════════════════════════════════

router.post('/brainstorm', async (req: Request, res: Response) => {
  try {
    const { channelId, topic, mode = 'quick', researchContext } = req.body;
    if (!channelId) return res.status(400).json({ error: 'channelId is verplicht' });

    const channel = await prisma.channel.findUnique({ where: { id: channelId as string } });
    if (!channel) return res.status(404).json({ error: 'Kanaal niet gevonden' });
    const settings = await getSettings();
    if (!settings?.elevateApiKey) return res.status(400).json({ error: 'Elevate API key niet geconfigureerd' });
    const ytId = channel.youtubeChannelId;
    if (!ytId) return res.status(400).json({ error: 'YouTube Channel ID niet ingesteld' });

    const nexlev = await getNexLev();

    // Use cached data if available, otherwise fetch (costs credits)
    const aboutResult = await getCachedOrFetch(channelId, 'about', () => nexlev.getChannelAbout(ytId));
    const outliersResult = await getCachedOrFetch(channelId, 'outliers', () => nexlev.getChannelOutliers(ytId));
    let analyticsResult = null;
    if (mode === 'deep') {
      analyticsResult = await getCachedOrFetch(channelId, 'analytics', () => nexlev.getAnalytics(ytId));
    }

    let creditsUsed = 0;
    if (!aboutResult.cached) creditsUsed++;
    if (!outliersResult.cached) creditsUsed++;
    if (analyticsResult && !analyticsResult.cached) creditsUsed++;

    const parts: string[] = [];
    if (aboutResult.data) parts.push(`KANAAL INFO:\n${JSON.stringify(aboutResult.data, null, 2)}`);
    if (outliersResult.data) parts.push(`OUTLIERS:\n${JSON.stringify(outliersResult.data, null, 2)}`);
    if (analyticsResult?.data) parts.push(`ANALYTICS:\n${JSON.stringify(analyticsResult.data, null, 2)}`);
    const channelSummary = parts.join('\n\n---\n\n');

    const systemPrompt = `Je bent een expert YouTube content strateeg. Analyseer kanaaldata en bedenk virale video-ideeën.

Genereer precies 8 video-ideeën. Elk idee moet:
- Inspelen op bewezen patronen (outliers = wat werkt)
- Rekening houden met het kanaalthema en doelgroep
- Mix van veilige keuzes en creatieve risico's
- Specifiek genoeg zijn om direct als project te starten
${topic ? `- Focus op het topic: "${topic}"` : ''}
${researchContext ? '- Gebruik de extra research context die de gebruiker heeft verzameld' : ''}

Geef je antwoord als JSON array:
[
  {
    "title": "Video titel (pakkend, YouTube-waardig)",
    "description": "Korte beschrijving (2-3 zinnen)",
    "angle": "De specifieke invalshoek/hook",
    "videoType": "ai|spokesperson_ai|trending|documentary|compilation|spokesperson",
    "confidence": "high|medium|low",
    "reasoning": "Waarom dit idee goed is (1 zin)"
  }
]

Geef ALLEEN de JSON array terug.`;

    const userPrompt = `Kanaal: ${channel.name}\nBeschrijving: ${channel.description || 'Geen'}\nDefault video type: ${channel.defaultVideoType}\n${topic ? `\nTopic: ${topic}` : ''}\n\n${channelSummary}${researchContext ? `\n\n---\n\nEXTRA RESEARCH CONTEXT:\n${researchContext}` : ''}`;

    const llmResponse = await elevateLLM(systemPrompt, userPrompt, settings.elevateApiKey);
    let ideas: any[];
    try { ideas = JSON.parse(llmResponse); }
    catch { const m = llmResponse.match(/\[[\s\S]*\]/); ideas = m ? JSON.parse(m[0]) : []; }

    res.json({
      success: true,
      ideas: ideas.map((idea: any, idx: number) => ({
        tempId: `brainstorm-${Date.now()}-${idx}`,
        title: idea.title || 'Untitled', description: idea.description || '',
        angle: idea.angle || '', videoType: idea.videoType || channel.defaultVideoType,
        confidence: idea.confidence || 'medium', reasoning: idea.reasoning || '', source: 'ai',
      })),
      creditsUsed,
    });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ══════════════════════════════════════════════════════════
// IDEAS CRUD
// ══════════════════════════════════════════════════════════

router.get('/ideas', async (req: Request, res: Response) => {
  try {
    const where: any = {};
    if (req.query.channelId) where.channelId = req.query.channelId as string;
    const ideas = await prisma.idea.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: { channel: { select: { name: true } } },
    });
    res.json(ideas);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/ideas', async (req: Request, res: Response) => {
  try {
    const { channelId, title, description, angle, videoType, referenceVideos, confidence, reasoning, source } = req.body;
    if (!channelId || !title) return res.status(400).json({ error: 'channelId en title zijn verplicht' });
    const idea = await prisma.idea.create({
      data: {
        channelId, title, description: description || '', videoType: videoType || 'ai',
        referenceVideos: JSON.stringify(referenceVideos || []), status: 'saved',
        sourceData: JSON.stringify({ angle, confidence, reasoning, source: source || 'manual' }),
      },
    });
    res.status(201).json(idea);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.put('/ideas/:id', async (req: Request, res: Response) => {
  try {
    const { title, description, videoType, referenceVideos, status } = req.body;
    const idea = await prisma.idea.update({
      where: { id: req.params.id as string },
      data: {
        ...(title !== undefined && { title }), ...(description !== undefined && { description }),
        ...(videoType !== undefined && { videoType }),
        ...(referenceVideos !== undefined && { referenceVideos: JSON.stringify(referenceVideos) }),
        ...(status !== undefined && { status }),
      },
    });
    res.json(idea);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.delete('/ideas/:id', async (req: Request, res: Response) => {
  try {
    await prisma.idea.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ══════════════════════════════════════════════════════════
// CONVERT IDEA → PROJECT
// ══════════════════════════════════════════════════════════

router.post('/convert/:ideaId', async (req: Request, res: Response) => {
  try {
    const idea = await prisma.idea.findUnique({
      where: { id: req.params.ideaId as string }, include: { channel: true },
    });
    if (!idea) return res.status(404).json({ error: 'Idee niet gevonden' });

    const projectName = idea.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').substring(0, 50);
    const project = await prisma.project.create({
      data: {
        name: projectName, title: idea.title, description: idea.description,
        videoType: idea.videoType || 'ai', channelId: idea.channelId,
        language: 'EN', scriptSource: 'new',
        referenceVideos: idea.referenceVideos || '[]',
        voice: 'Default', backgroundMusic: true, visualStyle: '3d-render',
        stockImages: true, colorGrading: 'Geen', subtitles: false,
        output: 'YouTube 1080p', aspectRatio: 'landscape', useClips: false,
        checkpoints: JSON.stringify([3, 4, 6, 9]), enabledSteps: JSON.stringify([]),
        imageSelectionMode: 'auto', imagesPerScene: 1, transitionMode: 'uniform',
        uniformTransition: 'cross-dissolve', status: 'draft',
      },
    });

    await prisma.idea.update({ where: { id: idea.id }, data: { status: 'converted', projectId: project.id } });
    res.json({ success: true, projectId: project.id });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

export default router;
