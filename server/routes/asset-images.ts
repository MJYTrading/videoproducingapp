import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// GET /api/asset-images?search=...&category=...&source=...&limit=...
router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, category, source, style, limit } = req.query;
    const take = Math.min(parseInt(limit as string) || 50, 200);

    const where: any = {};
    if (category) where.category = category as string;
    if (source) where.source = source as string;
    if (style) where.style = style as string;

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

    const images = await prisma.assetImage.findMany({
      where, take, orderBy: { createdAt: 'desc' },
    });

    res.json(images.map(img => ({
      ...img,
      tags: JSON.parse(img.tags || '[]'),
      subjects: JSON.parse(img.subjects || '[]'),
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/asset-images/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const image = await prisma.assetImage.findUnique({ where: { id: req.params.id } });
    if (!image) return res.status(404).json({ error: 'Image not found' });
    res.json({ ...image, tags: JSON.parse(image.tags || '[]'), subjects: JSON.parse(image.subjects || '[]') });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/asset-images
router.post('/', async (req: Request, res: Response) => {
  try {
    const { sourceUrl, localPath, thumbnailPath, title, description, tags, category, subjects, mood, style, source, width, height, fileSize, quality, projectId } = req.body;
    if (!title || !sourceUrl) return res.status(400).json({ error: 'title en sourceUrl zijn verplicht' });

    const image = await prisma.assetImage.create({
      data: {
        sourceUrl, localPath: localPath || '', thumbnailPath,
        title, description: description || '',
        tags: JSON.stringify(tags || []),
        category: category || 'general',
        subjects: JSON.stringify(subjects || []),
        mood, style, source: source || 'manual',
        width, height, fileSize, quality, projectId,
      },
    });
    res.status(201).json({ ...image, tags: JSON.parse(image.tags), subjects: JSON.parse(image.subjects) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/asset-images/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { title, description, tags, category, subjects, mood, style, quality } = req.body;
    const data: any = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (tags !== undefined) data.tags = JSON.stringify(tags);
    if (category !== undefined) data.category = category;
    if (subjects !== undefined) data.subjects = JSON.stringify(subjects);
    if (mood !== undefined) data.mood = mood;
    if (style !== undefined) data.style = style;
    if (quality !== undefined) data.quality = quality;

    const image = await prisma.assetImage.update({ where: { id: req.params.id }, data });
    res.json({ ...image, tags: JSON.parse(image.tags), subjects: JSON.parse(image.subjects) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/asset-images/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.assetImage.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/asset-images/:id/use — Track usage
router.post('/:id/use', async (req: Request, res: Response) => {
  try {
    const image = await prisma.assetImage.update({
      where: { id: req.params.id },
      data: { timesUsed: { increment: 1 }, lastUsedAt: new Date() },
    });
    res.json(image);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
