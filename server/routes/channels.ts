import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const channels = await prisma.channel.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { projects: true } } },
    });
    res.json(channels.map(c => ({
      ...c,
      projectCount: c._count.projects,
      _count: undefined,
    })));
  } catch (error: any) {
    console.error('GET /channels error:', error);
    res.status(500).json({ error: 'Kon kanalen niet ophalen' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, driveFolderId, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Naam is verplicht' });
    const channel = await prisma.channel.create({
      data: { name, driveFolderId: driveFolderId || '', description: description || null },
    });
    res.status(201).json(channel);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Kanaalnaam bestaat al' });
    console.error('POST /channels error:', error);
    res.status(500).json({ error: 'Kon kanaal niet aanmaken' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, driveFolderId, description } = req.body;
    const channel = await prisma.channel.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(driveFolderId !== undefined && { driveFolderId }),
        ...(description !== undefined && { description }),
      },
    });
    res.json(channel);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Kanaal niet gevonden' });
    console.error('PUT /channels/:id error:', error);
    res.status(500).json({ error: 'Kon kanaal niet bijwerken' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.channel.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Kanaal niet gevonden' });
    console.error('DELETE /channels/:id error:', error);
    res.status(500).json({ error: 'Kon kanaal niet verwijderen' });
  }
});

export default router;
