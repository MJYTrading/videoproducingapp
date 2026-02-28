import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// GET /api/assets/review/:projectId — Haal alle assets op voor review
router.get('/review/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { type, status } = req.query;

    const clips = await prisma.assetClip.findMany({
      where: {
        ...(projectId !== 'all' ? { id: { contains: '' } } : {}),
        ...(status ? { reviewStatus: status as string } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const images = await prisma.assetImage.findMany({
      where: {
        ...(projectId !== 'all' ? { projectId } : {}),
        ...(status ? { reviewStatus: status as string } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({
      clips: type === 'images' ? [] : clips,
      images: type === 'clips' ? [] : images,
      counts: {
        clipsPending: clips.filter(c => c.reviewStatus === 'pending').length,
        clipsApproved: clips.filter(c => c.reviewStatus === 'approved').length,
        clipsRejected: clips.filter(c => c.reviewStatus === 'rejected').length,
        imagesPending: images.filter(i => i.reviewStatus === 'pending').length,
        imagesApproved: images.filter(i => i.reviewStatus === 'approved').length,
        imagesRejected: images.filter(i => i.reviewStatus === 'rejected').length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/assets/review/:id — Update review status
router.patch('/review/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, type } = req.body; // status: approved|rejected|pending, type: clip|image

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Status moet approved, rejected of pending zijn' });
    }

    if (type === 'clip') {
      await prisma.assetClip.update({ where: { id }, data: { reviewStatus: status } });
    } else {
      await prisma.assetImage.update({ where: { id }, data: { reviewStatus: status } });
    }

    res.json({ success: true, id, status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/assets/review-bulk — Bulk approve/reject
router.patch('/review-bulk', async (req: Request, res: Response) => {
  try {
    const { ids, status, type } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Geen IDs opgegeven' });
    }

    if (type === 'clip') {
      await prisma.assetClip.updateMany({ where: { id: { in: ids } }, data: { reviewStatus: status } });
    } else {
      await prisma.assetImage.updateMany({ where: { id: { in: ids } }, data: { reviewStatus: status } });
    }

    res.json({ success: true, count: ids.length, status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
