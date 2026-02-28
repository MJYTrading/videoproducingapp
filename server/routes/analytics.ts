/**
 * Analytics Route — YouTube views tracking via yt-api.p.rapidapi.com
 * 
 * Per-video tracking: haalt ~60 video's op (2 pagina's), slaat views per video op,
 * berekent verschil met vorige snapshot per video, en telt op tot kanaal totaal.
 * 
 * GET  /api/analytics/summary                 — dashboard samenvatting
 * GET  /api/analytics/views?hours=24          — views per uur
 * GET  /api/analytics/revenue?period=day      — inkomsten berekening
 * POST /api/analytics/fetch-views             — handmatig views ophalen
 * POST /api/analytics/resolve-channel         — resolve @handle → UC ID
 * PATCH /api/analytics/channel/:id/rpm        — RPM handmatig aanpassen
 */
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

const YT_API_BASE = 'https://yt-api.p.rapidapi.com';

// ── Helpers ──

function extractChannelId(input: string): string {
  if (!input) return '';
  if (input.startsWith('UC') && !input.includes('/') && !input.includes('.')) return input;
  const match = input.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return input.trim().replace(/\/+$/, '');
}

function getHourKey(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0));
}

// ── YouTube API calls ──

interface VideoData {
  videoId: string;
  title: string;
  viewCount: number;
  publishDate: string;
}

async function fetchChannelVideosPage(channelId: string, rapidApiKey: string, token?: string): Promise<{ videos: VideoData[]; continuation: string; meta: any }> {
  const url = token
    ? `${YT_API_BASE}/channel/videos?id=${channelId}&token=${token}`
    : `${YT_API_BASE}/channel/videos?id=${channelId}&sort_by=newest`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': 'yt-api.p.rapidapi.com',
      'x-rapidapi-key': rapidApiKey,
          'X-CACHEBYPASS': '1',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`yt-api ${response.status}: ${text.substring(0, 200)}`);
  }

  const data = await response.json();
  if (data.msg) throw new Error(`yt-api: ${data.msg}`);

  const videos: VideoData[] = (data.data || [])
    .filter((v: any) => v.type === 'video' || v.videoId)
    .map((v: any) => ({
      videoId: v.videoId,
      title: v.title || '',
      viewCount: parseInt(v.viewCount || '0', 10),
      publishDate: v.publishDate || '',
    }));

  return {
    videos,
    continuation: data.continuation || '',
    meta: data.meta || {},
  };
}

/** Haalt ~60 video's op (2 pagina's) */
async function fetchAllChannelVideos(channelId: string, rapidApiKey: string): Promise<{ videos: VideoData[]; meta: any }> {
  // Pagina 1
  const page1 = await fetchChannelVideosPage(channelId, rapidApiKey);
  let allVideos = [...page1.videos];

  // Pagina 2 (als er een continuation token is)
  if (page1.continuation) {
    try {
      const page2 = await fetchChannelVideosPage(channelId, rapidApiKey, page1.continuation);
      allVideos = [...allVideos, ...page2.videos];
    } catch (err: any) {
      console.warn(`[Analytics] Pagina 2 mislukt voor ${channelId}: ${err.message}`);
    }
  }

  return { videos: allVideos, meta: page1.meta };
}

async function resolveHandle(handle: string, rapidApiKey: string): Promise<string | null> {
  try {
    const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;
    const url = `${YT_API_BASE}/resolve?url=${encodeURIComponent(`https://www.youtube.com/${cleanHandle}`)}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': 'yt-api.p.rapidapi.com',
        'x-rapidapi-key': rapidApiKey,
          'X-CACHEBYPASS': '1',
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.browseId || null;
  } catch {
    return null;
  }
}

// ── Snapshots opslaan met per-video tracking ──

async function saveVideoSnapshots(channelId: string, videos: VideoData[]): Promise<{ totalViews: number; viewsGainedTotal: number }> {
  const hour = getHourKey();
  let totalViews = 0;
  let viewsGainedTotal = 0;

  for (const video of videos) {
    totalViews += video.viewCount;

    // Haal vorige snapshot op (uit een eerder uur dan nu)
    const previous = await prisma.videoViewSnapshot.findFirst({
      where: { channelId, videoId: video.videoId, hour: { lt: hour } },
      orderBy: { hour: 'desc' },
    });

    // Als er geen eerdere snapshot is, check of er al een record in dit uur staat
    const currentHourRecord = await prisma.videoViewSnapshot.findUnique({
      where: { channelId_videoId_hour: { channelId, videoId: video.videoId, hour } },
    });

    // Bereken views verschil
    let viewsGained = 0;
    if (previous) {
      // Verschil met vorig uur
      viewsGained = Math.max(0, video.viewCount - previous.viewCount);
    } else if (currentHourRecord && currentHourRecord.viewCount > 0) {
      // Binnen hetzelfde uur: verschil met eerder opgeslagen waarde
      viewsGained = Math.max(0, video.viewCount - currentHourRecord.viewCount);
    }
    // Allereerste keer: verschil = 0 (correct)

    viewsGainedTotal += viewsGained;

    // Upsert per video per uur
    await prisma.videoViewSnapshot.upsert({
      where: { channelId_videoId_hour: { channelId, videoId: video.videoId, hour } },
      update: { viewCount: video.viewCount, viewsGained: (currentHourRecord?.viewsGained || 0) + viewsGained, title: video.title },
      create: {
        channelId,
        videoId: video.videoId,
        title: video.title,
        hour,
        viewCount: video.viewCount,
        viewsGained,
        publishDate: video.publishDate,
      },
    });
  }

  // Sla ook kanaal-totaal snapshot op
  await prisma.channelViewSnapshot.upsert({
    where: { channelId_hour: { channelId, hour } },
    update: { totalViews, viewsInHour: viewsGainedTotal },
    create: { channelId, hour, totalViews, viewsInHour: viewsGainedTotal },
  });

  return { totalViews, viewsGainedTotal };
}

// ── Verwerk 1 kanaal ──

async function processChannel(channel: any, rapidApiKey: string): Promise<any> {
  let ucId = extractChannelId(channel.youtubeChannelId);

  // Resolve @handle als nodig
  if (!ucId.startsWith('UC')) {
    const resolved = await resolveHandle(ucId, rapidApiKey);
    if (resolved) {
      await prisma.channel.update({ where: { id: channel.id }, data: { youtubeChannelId: resolved } });
      ucId = resolved;
      console.log(`[Analytics] Resolved ${channel.name} → ${resolved}`);
    } else {
      return { channelId: channel.id, channelName: channel.name, error: 'Kon channel ID niet resolven' };
    }
  }

  const data = await fetchAllChannelVideos(ucId, rapidApiKey);
  const { totalViews, viewsGainedTotal } = await saveVideoSnapshots(channel.id, data.videos);

  console.log(`[Analytics] ${channel.name}: ${totalViews} total views, +${viewsGainedTotal} gained, ${data.videos.length} videos`);

  return {
    channelId: channel.id,
    channelName: channel.name,
    totalViews,
    viewsGained: viewsGainedTotal,
    videosTracked: data.videos.length,
    subscriberCount: data.meta?.subscriberCount || 0,
  };
}

// ── Routes ──

// GET /api/analytics/summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const channels = await prisma.channel.findMany({
      where: { youtubeChannelId: { not: '' } },
      select: { id: true, name: true, rpm: true, youtubeChannelId: true },
    });

    const snapshots = await prisma.channelViewSnapshot.findMany({
      where: { hour: { gte: last24h } },
      orderBy: { hour: 'asc' },
    });

    // Laatste totaal per kanaal (baseline)
    const latestSnapshots: Record<string, number> = {};
    for (const ch of channels) {
      const latest = await prisma.channelViewSnapshot.findFirst({
        where: { channelId: ch.id },
        orderBy: { hour: 'desc' },
      });
      latestSnapshots[ch.id] = latest?.totalViews || 0;
    }

    // Bouw 24-uur array
    const hourlyData: { hour: string; views: number; byChannel: Record<string, number> }[] = [];
    for (let i = 23; i >= 0; i--) {
      const hourDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() - i, 0, 0));
      const hourSnapshots = snapshots.filter(s => {
        const sHour = new Date(s.hour);
        return sHour.getTime() === hourDate.getTime();
      });

      const byChannel: Record<string, number> = {};
      let totalViews = 0;
      for (const s of hourSnapshots) {
        byChannel[s.channelId] = s.viewsInHour;
        totalViews += s.viewsInHour;
      }

      hourlyData.push({ hour: hourDate.toISOString(), views: totalViews, byChannel });
    }

    const totalViews24h = hourlyData.reduce((sum, h) => sum + h.views, 0);

    // Inkomsten per kanaal
    const revenuePerChannel: Record<string, number> = {};
    for (const ch of channels) {
      revenuePerChannel[ch.id] = 0;
      for (const h of hourlyData) {
        const chViews = h.byChannel[ch.id] || 0;
        revenuePerChannel[ch.id] += (chViews / 1000) * ch.rpm;
      }
    }

    const totalRevenue24h = Object.values(revenuePerChannel).reduce((sum, r) => sum + r, 0);

    res.json({
      totalViews24h,
      totalRevenue24h: Math.round(totalRevenue24h * 100) / 100,
      revenuePerHourAvg: Math.round((totalRevenue24h / 24) * 100) / 100,
      hourlyData,
      channels: channels.map(ch => ({
        ...ch,
        views24h: hourlyData.reduce((sum, h) => sum + (h.byChannel[ch.id] || 0), 0),
        revenue24h: Math.round((revenuePerChannel[ch.id] || 0) * 100) / 100,
        totalViews: latestSnapshots[ch.id] || 0,
      })),
    });
  } catch (err: any) {
    console.error('[Analytics] Summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/views?hours=24
router.get('/views', async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const snapshots = await prisma.channelViewSnapshot.findMany({
      where: { hour: { gte: since } },
      include: { channel: { select: { id: true, name: true, youtubeChannelId: true, rpm: true } } },
      orderBy: { hour: 'asc' },
    });

    const byChannel: Record<string, { channel: any; snapshots: any[] }> = {};
    for (const s of snapshots) {
      if (!byChannel[s.channelId]) {
        byChannel[s.channelId] = { channel: s.channel, snapshots: [] };
      }
      byChannel[s.channelId].snapshots.push({
        hour: s.hour, totalViews: s.totalViews, viewsInHour: s.viewsInHour,
      });
    }

    let totalViewsInPeriod = 0;
    for (const ch of Object.values(byChannel)) {
      totalViewsInPeriod += ch.snapshots.reduce((sum: number, s: any) => sum + s.viewsInHour, 0);
    }

    res.json({ hours, totalViewsInPeriod, channels: byChannel });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/revenue?period=day
router.get('/revenue', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || 'day';
    const periodHours: Record<string, number> = { hour: 1, day: 24, week: 168, month: 720 };
    const hours = periodHours[period] || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const channels = await prisma.channel.findMany({
      where: { youtubeChannelId: { not: '' } },
      select: { id: true, name: true, rpm: true },
    });

    const results: any[] = [];
    let totalRevenue = 0;

    for (const channel of channels) {
      const snapshots = await prisma.channelViewSnapshot.findMany({
        where: { channelId: channel.id, hour: { gte: since } },
      });
      const viewsInPeriod = snapshots.reduce((sum, s) => sum + s.viewsInHour, 0);
      const revenue = (viewsInPeriod / 1000) * channel.rpm;
      totalRevenue += revenue;
      results.push({
        channelId: channel.id, channelName: channel.name,
        rpm: channel.rpm, viewsInPeriod,
        revenue: Math.round(revenue * 100) / 100,
      });
    }

    res.json({ period, hours, totalRevenue: Math.round(totalRevenue * 100) / 100, channels: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/fetch-views — handmatig views ophalen
router.post('/fetch-views', async (req: Request, res: Response) => {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    const rapidApiKey = (settings as any)?.youtubeRapidApiKey;
    if (!rapidApiKey) {
      return res.status(400).json({ error: 'YouTube RapidAPI key niet ingesteld in Settings' });
    }

    const channels = await prisma.channel.findMany({
      where: { youtubeChannelId: { not: '' } },
    });

    if (channels.length === 0) {
      return res.json({ message: 'Geen kanalen met YouTube Channel ID', results: [] });
    }

    const results: any[] = [];
    for (const channel of channels) {
      try {
        const result = await processChannel(channel, rapidApiKey);
        results.push(result);
      } catch (err: any) {
        results.push({ channelId: channel.id, channelName: channel.name, error: err.message });
      }
    }

    res.json({
      message: `Views opgehaald voor ${results.filter(r => !r.error).length}/${channels.length} kanalen`,
      results,
    });
  } catch (err: any) {
    console.error('[Analytics] Fetch views error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/resolve-channel
router.post('/resolve-channel', async (req: Request, res: Response) => {
  try {
    const { handle } = req.body;
    if (!handle) return res.status(400).json({ error: 'handle is vereist' });

    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    const rapidApiKey = (settings as any)?.youtubeRapidApiKey;
    if (!rapidApiKey) return res.status(400).json({ error: 'YouTube RapidAPI key niet ingesteld' });

    const channelId = await resolveHandle(handle, rapidApiKey);
    if (!channelId) return res.status(404).json({ error: 'Kon handle niet resolven' });

    res.json({ handle, channelId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/analytics/channel/:id/rpm
router.patch('/channel/:id/rpm', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rpm } = req.body;
    if (typeof rpm !== 'number' || rpm < 0) {
      return res.status(400).json({ error: 'RPM moet een positief getal zijn' });
    }
    const channel = await prisma.channel.update({ where: { id }, data: { rpm } });
    res.json({ channelId: channel.id, rpm: channel.rpm });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

// ── Cron Job ──

export async function startViewsCron() {
  function randomInterval(): number {
    const minMs = 55 * 60 * 1000;
    const maxMs = 65 * 60 * 1000;
    return Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  }

  const fetchAll = async () => {
    try {
      const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
      const rapidApiKey = (settings as any)?.youtubeRapidApiKey;
      if (!rapidApiKey) {
        const next = randomInterval();
        setTimeout(fetchAll, next);
        return;
      }

      const channels = await prisma.channel.findMany({
        where: { youtubeChannelId: { not: '' } },
      });

      for (const channel of channels) {
        try {
          await processChannel(channel, rapidApiKey);
        } catch (err: any) {
          console.error(`[Analytics Cron] ${channel.name} error:`, err.message);
        }
      }
    } catch (err: any) {
      console.error('[Analytics Cron] Error:', err.message);
    }

    const next = randomInterval();
    console.log(`[Analytics Cron] Volgende run over ${Math.round(next / 60000)} minuten`);
    setTimeout(fetchAll, next);
  };

  setTimeout(fetchAll, 10_000);
  console.log('[Analytics] Views cron gestart (interval: 55-65 min random)');
}
