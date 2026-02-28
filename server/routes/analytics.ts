/**
 * Analytics Route — YouTube views tracking via yt-api.p.rapidapi.com
 * 
 * Haalt per kanaal alle video's + views op via /channel/videos endpoint.
 * Berekent totale views per uur door verschil met vorige snapshot.
 * Inkomsten worden berekend op basis van RPM per kanaal.
 * 
 * GET  /api/analytics/views?hours=24          — views per uur afgelopen X uur
 * GET  /api/analytics/revenue?period=day      — inkomsten berekening
 * POST /api/analytics/fetch-views             — handmatig views ophalen
 * PATCH /api/analytics/channel/:id/rpm        — RPM handmatig aanpassen
 * GET  /api/analytics/summary                 — dashboard samenvatting
 */
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

const YT_API_BASE = 'https://yt-api.p.rapidapi.com';

// ── Helpers ──

/** Extract UC... channel ID uit URL of geef raw ID terug */
function extractChannelId(input: string): string {
  if (!input) return '';
  // Al een UC ID
  if (input.startsWith('UC') && !input.includes('/') && !input.includes('.')) return input;
  // URL formaat: /channel/UCxxxxxx
  const match = input.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // Schoon op
  return input.trim().replace(/\/+$/, '');
}

/** Haal video's + views op via yt-api.p.rapidapi.com */
async function fetchChannelVideos(channelId: string, rapidApiKey: string): Promise<{ meta: any; videos: any[] } | null> {
  try {
    const ucId = extractChannelId(channelId);
    if (!ucId) {
      console.error(`[Analytics] Geen geldig channel ID: ${channelId}`);
      return null;
    }

    const response = await fetch(
      `${YT_API_BASE}/channel/videos?id=${ucId}&sort_by=newest`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-host': 'yt-api.p.rapidapi.com',
          'x-rapidapi-key': rapidApiKey,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error(`[Analytics] yt-api error ${response.status}: ${text.substring(0, 200)}`);
      return null;
    }

    const data = await response.json();
    if (data.msg) {
      console.error(`[Analytics] yt-api msg: ${data.msg}`);
      return null;
    }

    const videos = (data.data || []).map((v: any) => ({
      videoId: v.videoId,
      title: v.title,
      viewCount: parseInt(v.viewCount || '0', 10),
      publishDate: v.publishDate,
    }));

    // Tel totale views over alle video's
    const totalViews = videos.reduce((sum: number, v: any) => sum + v.viewCount, 0);

    return {
      meta: {
        channelId: data.meta?.channelId || ucId,
        title: data.meta?.title || '',
        subscriberCount: data.meta?.subscriberCount || 0,
        videosCount: data.meta?.videosCount || videos.length,
        totalViews,
      },
      videos,
    };
  } catch (err: any) {
    console.error(`[Analytics] Fetch error voor ${channelId}:`, err.message);
    return null;
  }
}

/** Resolve een @handle naar channel ID via yt-api */
async function resolveHandle(handle: string, rapidApiKey: string): Promise<string | null> {
  try {
    const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;
    const url = `${YT_API_BASE}/resolve?url=${encodeURIComponent(`https://www.youtube.com/${cleanHandle}`)}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': 'yt-api.p.rapidapi.com',
        'x-rapidapi-key': rapidApiKey,
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.browseId || null;
  } catch {
    return null;
  }
}

// ── Snapshot opslaan ──

async function saveViewSnapshot(channelId: string, totalViews: number) {
  const now = new Date();
  const hour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);

  // Haal vorige snapshot op
  const previous = await prisma.channelViewSnapshot.findFirst({
    where: { channelId },
    orderBy: { hour: 'desc' },
  });

  const viewsInHour = previous ? Math.max(0, totalViews - previous.totalViews) : 0;

  await prisma.channelViewSnapshot.upsert({
    where: { channelId_hour: { channelId, hour } },
    update: { totalViews, viewsInHour },
    create: { channelId, hour, totalViews, viewsInHour },
  });

  return { hour, totalViews, viewsInHour };
}

// ── Routes ──

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
        hour: s.hour,
        totalViews: s.totalViews,
        viewsInHour: s.viewsInHour,
      });
    }

    let totalViewsInPeriod = 0;
    for (const ch of Object.values(byChannel)) {
      totalViewsInPeriod += ch.snapshots.reduce((sum: number, s: any) => sum + s.viewsInHour, 0);
    }

    res.json({ hours, totalViewsInPeriod, channels: byChannel });
  } catch (err: any) {
    console.error('[Analytics] Views error:', err.message);
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
    console.error('[Analytics] Revenue error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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

    // Array van 24 uren
    const hourlyData: { hour: string; views: number; byChannel: Record<string, number> }[] = [];
    for (let i = 23; i >= 0; i--) {
      const hourDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - i, 0, 0);
      const hourSnapshots = snapshots.filter(s => {
        const sHour = new Date(s.hour);
        return sHour.getFullYear() === hourDate.getFullYear() &&
               sHour.getMonth() === hourDate.getMonth() &&
               sHour.getDate() === hourDate.getDate() &&
               sHour.getHours() === hourDate.getHours();
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

    const revenuePerChannel: Record<string, number> = {};
    for (const ch of channels) {
      revenuePerChannel[ch.id] = 0;
      for (const h of hourlyData) {
        const chViews = h.byChannel[ch.id] || 0;
        revenuePerChannel[ch.id] += (chViews / 1000) * ch.rpm;
      }
    }

    const totalRevenue24h = Object.values(revenuePerChannel).reduce((sum, r) => sum + r, 0);
    const revenuePerHourAvg = totalRevenue24h / 24;

    res.json({
      totalViews24h,
      totalRevenue24h: Math.round(totalRevenue24h * 100) / 100,
      revenuePerHourAvg: Math.round(revenuePerHourAvg * 100) / 100,
      hourlyData,
      channels: channels.map(ch => ({
        ...ch,
        views24h: hourlyData.reduce((sum, h) => sum + (h.byChannel[ch.id] || 0), 0),
        revenue24h: Math.round((revenuePerChannel[ch.id] || 0) * 100) / 100,
      })),
    });
  } catch (err: any) {
    console.error('[Analytics] Summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/fetch-views
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
      // Extract UC ID uit eventuele URL
      let ucId = extractChannelId(channel.youtubeChannelId);

      // Als het geen UC ID is (bijv. een @handle), probeer te resolven
      if (!ucId.startsWith('UC')) {
        const resolved = await resolveHandle(ucId, rapidApiKey);
        if (resolved) {
          // Sla het opgelost ID op in de database voor volgende keer
          await prisma.channel.update({
            where: { id: channel.id },
            data: { youtubeChannelId: resolved },
          });
          ucId = resolved;
          console.log(`[Analytics] Resolved ${channel.name} → ${resolved}`);
        } else {
          results.push({ channelId: channel.id, channelName: channel.name, error: 'Kon channel ID niet resolven' });
          continue;
        }
      }

      const data = await fetchChannelVideos(ucId, rapidApiKey);
      if (data) {
        const snapshot = await saveViewSnapshot(channel.id, data.meta.totalViews);
        results.push({
          channelId: channel.id,
          channelName: channel.name,
          totalViews: data.meta.totalViews,
          videosCount: data.videos.length,
          subscriberCount: data.meta.subscriberCount,
          ...snapshot,
        });
        console.log(`[Analytics] ${channel.name}: ${data.meta.totalViews} total views across ${data.videos.length} videos`);
      } else {
        results.push({ channelId: channel.id, channelName: channel.name, error: 'Kon views niet ophalen' });
      }
    }

    res.json({ message: `Views opgehaald voor ${results.filter(r => !r.error).length}/${channels.length} kanalen`, results });
  } catch (err: any) {
    console.error('[Analytics] Fetch views error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/resolve-channel — resolve @handle naar UC ID
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
    console.error('[Analytics] RPM update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

// ── Cron Job: elk uur views ophalen ──

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
      if (!rapidApiKey) return;

      const channels = await prisma.channel.findMany({
        where: { youtubeChannelId: { not: '' } },
      });

      for (const channel of channels) {
        let ucId = extractChannelId(channel.youtubeChannelId);
        if (!ucId.startsWith('UC')) continue;

        const data = await fetchChannelVideos(ucId, rapidApiKey);
        if (data) {
          await saveViewSnapshot(channel.id, data.meta.totalViews);
          console.log(`[Analytics Cron] ${channel.name}: ${data.meta.totalViews} views`);
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
