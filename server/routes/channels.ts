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

// Haal één kanaal op met projecten
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id as string },
      include: {
        projects: {
          orderBy: { createdAt: 'desc' },
          include: {
            steps: { orderBy: { stepNumber: 'asc' } },
          },
        },
        _count: { select: { projects: true } },
      },
    });
    if (!channel) return res.status(404).json({ error: 'Kanaal niet gevonden' });
    res.json({
      ...channel,
      projectCount: channel._count.projects,
      _count: undefined,
    });
  } catch (error: any) {
    console.error('GET /channels/:id error:', error);
    res.status(500).json({ error: 'Kon kanaal niet ophalen' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, driveFolderId, description, ...rest } = req.body;
    if (!name) return res.status(400).json({ error: 'Naam is verplicht' });

    const data: any = {
      name,
      driveFolderId: driveFolderId || '',
      description: description || null,
    };

    const optionalFields = [
      'youtubeChannelId', 'defaultVideoType', 'competitors',
      'maxClipDurationSeconds',
      'baseStyleProfile', 'baseResearchTemplate',
      'styleReferenceUrls', 'styleExtraInstructions',
      'usedClips',
      'overlayPresetId', 'sfxEnabled', 'specialEditsEnabled',
      // Standaard project instellingen
      'defaultScriptLengthMinutes', 'defaultVoiceId', 'defaultOutputFormat',
      'defaultAspectRatio', 'defaultSubtitles', 'defaultLanguage',
      'defaultVisualStyle', 'defaultVisualStyleParent', 'referenceScriptUrls',
    ];

    for (const field of optionalFields) {
      if (rest[field] !== undefined) data[field] = rest[field];
    }

    const channel = await prisma.channel.create({ data });
    res.status(201).json(channel);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Kanaalnaam bestaat al' });
    console.error('POST /channels error:', error);
    res.status(500).json({ error: 'Kon kanaal niet aanmaken' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updateData: any = {};
    const allowedFields = [
      'name', 'driveFolderId', 'description',
      'youtubeChannelId', 'defaultVideoType', 'competitors',
      'maxClipDurationSeconds',
      'baseStyleProfile', 'baseResearchTemplate',
      'styleReferenceUrls', 'styleExtraInstructions',
      'usedClips',
      'overlayPresetId', 'sfxEnabled', 'specialEditsEnabled',
      // Standaard project instellingen
      'defaultScriptLengthMinutes', 'defaultVoiceId', 'defaultOutputFormat',
      'defaultAspectRatio', 'defaultSubtitles', 'defaultLanguage',
      'defaultVisualStyle', 'defaultVisualStyleParent', 'referenceScriptUrls',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    }

    const channel = await prisma.channel.update({
      where: { id: req.params.id as string },
      data: updateData,
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
    await prisma.channel.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Kanaal niet gevonden' });
    console.error('DELETE /channels/:id error:', error);
    res.status(500).json({ error: 'Kon kanaal niet verwijderen' });
  }
});

export default router;
