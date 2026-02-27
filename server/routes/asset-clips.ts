import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// ══════════════════════════════════════════════════
// GET /api/asset-clips?search=...&category=...&limit=...
// Lijst/zoek asset clips
// ══════════════════════════════════════════════════
router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, category, mood, limit } = req.query;
    const take = Math.min(parseInt(limit as string) || 50, 200);

    const where: any = {};

    if (category) where.category = category as string;
    if (mood) where.mood = mood as string;

    // Zoek in tags, description, subjects, title
    if (search) {
      const term = search as string;
      where.OR = [
        { title: { contains: term } },
        { description: { contains: term } },
        { tags: { contains: term } },
        { subjects: { contains: term } },
        { category: { contains: term } },
      ];
    }

    const clips = await prisma.assetClip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });

    // Parse JSON strings voor response
    const parsed = clips.map(clip => ({
      ...clip,
      tags: JSON.parse(clip.tags || '[]'),
      subjects: JSON.parse(clip.subjects || '[]'),
    }));

    res.json(parsed);
  } catch (error: any) {
    console.error('GET /asset-clips error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
// GET /api/asset-clips/:id
// Enkel asset clip ophalen
// ══════════════════════════════════════════════════
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const clip = await prisma.assetClip.findUnique({ where: { id: req.params.id } });
    if (!clip) return res.status(404).json({ error: 'Clip niet gevonden' });

    res.json({
      ...clip,
      tags: JSON.parse(clip.tags || '[]'),
      subjects: JSON.parse(clip.subjects || '[]'),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
// POST /api/asset-clips
// Nieuwe clip toevoegen aan library
// ══════════════════════════════════════════════════
router.post('/', async (req: Request, res: Response) => {
  try {
    const { sourceUrl, videoId, title, startTime, endTime, localPath,
            thumbnailPath, tags, description, category, subjects, mood, quality } = req.body;

    if (!sourceUrl || !title) {
      return res.status(400).json({ error: 'sourceUrl en title zijn verplicht' });
    }

    const clip = await prisma.assetClip.create({
      data: {
        sourceUrl,
        videoId: videoId || '',
        title,
        startTime: startTime || '00:00',
        endTime: endTime || '00:00',
        localPath: localPath || '',
        thumbnailPath: thumbnailPath || null,
        tags: JSON.stringify(tags || []),
        description: description || '',
        category: category || 'other',
        subjects: JSON.stringify(subjects || []),
        mood: mood || null,
        quality: quality || null,
      },
    });

    res.status(201).json({
      ...clip,
      tags: JSON.parse(clip.tags),
      subjects: JSON.parse(clip.subjects),
    });
  } catch (error: any) {
    console.error('POST /asset-clips error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
// PUT /api/asset-clips/:id
// Clip bijwerken
// ══════════════════════════════════════════════════
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { title, tags, description, category, subjects, mood, quality } = req.body;

    const clip = await prisma.assetClip.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(tags !== undefined && { tags: JSON.stringify(tags) }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(subjects !== undefined && { subjects: JSON.stringify(subjects) }),
        ...(mood !== undefined && { mood }),
        ...(quality !== undefined && { quality }),
      },
    });

    res.json({
      ...clip,
      tags: JSON.parse(clip.tags),
      subjects: JSON.parse(clip.subjects),
    });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Clip niet gevonden' });
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
// DELETE /api/asset-clips/:id
// Clip verwijderen
// ══════════════════════════════════════════════════
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.assetClip.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Clip niet gevonden' });
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
// POST /api/asset-clips/:id/use
// Markeer clip als gebruikt (verhoog timesUsed)
// ══════════════════════════════════════════════════
router.post('/:id/use', async (req: Request, res: Response) => {
  try {
    const clip = await prisma.assetClip.update({
      where: { id: req.params.id },
      data: {
        timesUsed: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
    res.json({ success: true, timesUsed: clip.timesUsed });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Clip niet gevonden' });
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
// POST /api/asset-clips/search
// Intelligente zoektocht in clip library (door pipeline)
// ══════════════════════════════════════════════════
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, tags, category, mood, excludeIds, limit } = req.body;
    const take = Math.min(limit || 10, 50);

    const where: any = {};
    const conditions: any[] = [];

    if (category) conditions.push({ category });
    if (mood) conditions.push({ mood });

    // Zoek op tags overlap
    if (tags && Array.isArray(tags) && tags.length > 0) {
      const tagConditions = tags.map((tag: string) => ({ tags: { contains: tag } }));
      conditions.push({ OR: tagConditions });
    }

    // Zoek op tekst
    if (query) {
      conditions.push({
        OR: [
          { title: { contains: query } },
          { description: { contains: query } },
          { tags: { contains: query } },
          { subjects: { contains: query } },
        ],
      });
    }

    // Exclude al gebruikte IDs
    if (excludeIds && Array.isArray(excludeIds) && excludeIds.length > 0) {
      conditions.push({ id: { notIn: excludeIds } });
    }

    if (conditions.length > 0) where.AND = conditions;

    const clips = await prisma.assetClip.findMany({
      where,
      orderBy: [
        { quality: 'desc' },
        { timesUsed: 'asc' }, // Minst gebruikte clips eerst
      ],
      take,
    });

    res.json(clips.map(clip => ({
      ...clip,
      tags: JSON.parse(clip.tags || '[]'),
      subjects: JSON.parse(clip.subjects || '[]'),
    })));
  } catch (error: any) {
    console.error('POST /asset-clips/search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
// GET /api/asset-clips/stats/overview
// Statistieken over de clip library
// ══════════════════════════════════════════════════
router.get('/stats/overview', async (req: Request, res: Response) => {
  try {
    const total = await prisma.assetClip.count();
    const categories = await prisma.assetClip.groupBy({
      by: ['category'],
      _count: true,
    });

    res.json({
      total,
      categories: categories.map(c => ({ category: c.category, count: c._count })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
