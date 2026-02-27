import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    let settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings) settings = await prisma.settings.create({ data: { id: 'singleton' } });
    res.json(settings);
  } catch (error: any) {
    console.error('GET /settings error:', error);
    res.status(500).json({ error: 'Kon settings niet ophalen' });
  }
});

router.patch('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const existing = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (!existing) await prisma.settings.create({ data: { id: 'singleton' } });
    const updateData: any = {};
    const allowedFields = [
      'elevateApiKey', 'n8nBaseUrl', 'assemblyAiApiKey',
      'discordWebhookUrl', 'discordUserId', 'openClawUrl',
      'openClawHooksToken', 'defaultVoice', 'defaultVisualStyle',
      'defaultLanguage', 'defaultScriptLength', 'defaultSubtitles',
      'defaultColorGrading', 'youtubeTranscriptApiKey', 'anthropicApiKey',
      'genaiProApiKey', 'genaiProEnabled', 'genaiProImagesEnabled', 'videoDownloadApiKey',
    ];
    for (const field of allowedFields) {
      if (data[field] !== undefined) updateData[field] = data[field];
    }
    const settings = await prisma.settings.update({ where: { id: 'singleton' }, data: updateData });
    res.json(settings);
  } catch (error: any) {
    console.error('PATCH /settings error:', error);
    res.status(500).json({ error: 'Kon settings niet updaten' });
  }
});

export default router;
