/**
 * Analytics Route — YouTube views tracking + inkomsten berekening
 * 
 * GET  /api/analytics/views?hours=24          — views per uur afgelopen X uur (alle kanalen)
 * GET  /api/analytics/revenue?period=day      — inkomsten berekening (uur/dag/week/maand)
 * POST /api/analytics/fetch-views             — handmatig views ophalen voor alle kanalen
 * PATCH /api/analytics/channel/:id/rpm        — RPM handmatig aanpassen
 * GET  /api/analytics/summary                 — dashboard samenvatting
 */
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// ── YouTube RapidAPI Views ophalen ──

async function fetchYouTubeChannelViews(ytChannelId: string, rapidApiKey: string): Promise<number | null> {
  try {
    // Gebruik RapidAPI YouTube endpoint voor channel statistics
    const response = await fetch(
      `https://youtube-v31.p.rapidapi.com/channels?part=statistics&id=${ytChannelId}`,
      {
        headers: {
          'X-RapidAPI-Key': rapidApiKey,
          'X-RapidAPI-Host': 'youtube-v31.p.rapidapi.com',
        },
      }
    );

    if (!response.ok) {
      console.error(`[Analytics] RapidAPI error ${response.status} voor ${ytChannelId}`);
      return null;
    }

    const data = await response.json();
    const items = data?.items;
    if (!items || items.length === 0) return null;

    const viewCount = parseInt(items[0]?.statistics?.viewCount || '0', 10);
    return viewCount;
  } catch (err: any) {
    console.error(`[Analytics] Fetch views fout voor ${ytChannelId}:`, err.message);
    return null;
  }
}

// ── Snapshot opslaan ──

async function saveViewSnapshot(channelId: string, totalViews: number) {
  // Rond af naar huidig uur
  const now = new Date();
  const hour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);

  // Haal vorige snapshot op om viewsInHour te berekenen
  const previous = await prisma.channelViewSnapshot.findFirst({
    where: { channelId },
    orderBy: { hour: 'desc' },
  });

  const viewsInHour = previous ? Math.max(0, totalViews - previous.totalViews) : 0;

  // Upsert (update als er al een snapshot voor dit uur is)
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

    // Groepeer per kanaal
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

    // Totaal views in periode
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
    const periodHours: Record<string, number> = {
      hour: 1,
      day: 24,
      week: 168,
      month: 720,
    };
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
        channelId: channel.id,
        channelName: channel.name,
        rpm: channel.rpm,
        viewsInPeriod,
        revenue: Math.round(revenue * 100) / 100,
      });
    }

    res.json({
      period,
      hours,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      channels: results,
    });
  } catch (err: any) {
    console.error('[Analytics] Revenue error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/summary — dashboard samenvatting
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const channels = await prisma.channel.findMany({
      where: { youtubeChannelId: { not: '' } },
      select: { id: true, name: true, rpm: true, youtubeChannelId: true },
    });

    // Views per uur afgelopen 24 uur
    const snapshots = await prisma.channelViewSnapshot.findMany({
      where: { hour: { gte: last24h } },
      orderBy: { hour: 'asc' },
    });

    // Maak een array van 24 uren met totalen
    const hourlyData: { hour: string; views: number; byChannel: Record<string, number> }[] = [];
    for (let i = 23; i >= 0; i--) {
      const hourDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - i, 0, 0);
      const hourStr = hourDate.toISOString();
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

      hourlyData.push({ hour: hourStr, views: totalViews, byChannel });
    }

    // Totalen berekenen
    const totalViews24h = hourlyData.reduce((sum, h) => sum + h.views, 0);

    // Inkomsten per periode
    const revenuePerHour: Record<string, number> = {};
    for (const ch of channels) {
      for (const h of hourlyData) {
        const chViews = h.byChannel[ch.id] || 0;
        if (!revenuePerHour[ch.id]) revenuePerHour[ch.id] = 0;
        revenuePerHour[ch.id] += (chViews / 1000) * ch.rpm;
      }
    }

    const totalRevenue24h = Object.values(revenuePerHour).reduce((sum, r) => sum + r, 0);
    const revenuePerHourAvg = totalRevenue24h / 24;

    res.json({
      totalViews24h,
      totalRevenue24h: Math.round(totalRevenue24h * 100) / 100,
      revenuePerHourAvg: Math.round(revenuePerHourAvg * 100) / 100,
      hourlyData,
      channels: channels.map(ch => ({
        ...ch,
        views24h: hourlyData.reduce((sum, h) => sum + (h.byChannel[ch.id] || 0), 0),
        revenue24h: Math.round((revenuePerHour[ch.id] || 0) * 100) / 100,
      })),
    });
  } catch (err: any) {
    console.error('[Analytics] Summary error:', err.message);
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
      const totalViews = await fetchYouTubeChannelViews(channel.youtubeChannelId, rapidApiKey);
      if (totalViews !== null) {
        const snapshot = await saveViewSnapshot(channel.id, totalViews);
        results.push({ channelId: channel.id, channelName: channel.name, ...snapshot });
      } else {
        results.push({ channelId: channel.id, channelName: channel.name, error: 'Kon views niet ophalen' });
      }
    }

    res.json({ message: `Views opgehaald voor ${results.length} kanalen`, results });
  } catch (err: any) {
    console.error('[Analytics] Fetch views error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/analytics/channel/:id/rpm — RPM aanpassen
router.patch('/channel/:id/rpm', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rpm } = req.body;

    if (typeof rpm !== 'number' || rpm < 0) {
      return res.status(400).json({ error: 'RPM moet een positief getal zijn' });
    }

    const channel = await prisma.channel.update({
      where: { id },
      data: { rpm },
    });

    res.json({ channelId: channel.id, rpm: channel.rpm });
  } catch (err: any) {
    console.error('[Analytics] RPM update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

// ── Cron Job: elk uur views ophalen ──
// Dit wordt gestart vanuit index.ts

export async function startViewsCron() {
  const INTERVAL = 60 * 60 * 1000; // 1 uur

  const fetchAll = async () => {
    try {
      const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
      const rapidApiKey = (settings as any)?.youtubeRapidApiKey;
      if (!rapidApiKey) return;

      const channels = await prisma.channel.findMany({
        where: { youtubeChannelId: { not: '' } },
      });

      for (const channel of channels) {
        const totalViews = await fetchYouTubeChannelViews(channel.youtubeChannelId, rapidApiKey);
        if (totalViews !== null) {
          await saveViewSnapshot(channel.id, totalViews);
          console.log(`[Analytics Cron] ${channel.name}: ${totalViews} total views`);
        }
      }
    } catch (err: any) {
      console.error('[Analytics Cron] Error:', err.message);
    }
  };

  // Direct ophalen bij start
  setTimeout(fetchAll, 10000);
  // Daarna elk uur
  setInterval(fetchAll, INTERVAL);
  console.log('[Analytics] Hourly views cron gestart');
}
