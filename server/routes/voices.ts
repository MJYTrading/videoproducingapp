import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const voices = await prisma.voice.findMany({ orderBy: { name: 'asc' } });
    res.json(voices);
  } catch (error: any) {
    console.error('GET /voices error:', error);
    res.status(500).json({ error: 'Kon voices niet ophalen' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, voiceId, description, language } = req.body;
    if (!name || !voiceId) return res.status(400).json({ error: 'Naam en Voice ID zijn verplicht' });
    const voice = await prisma.voice.create({
      data: { name, voiceId, description: description || '', language: language || 'en-US' },
    });
    res.status(201).json(voice);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Voice ID bestaat al' });
    console.error('POST /voices error:', error);
    res.status(500).json({ error: 'Kon voice niet aanmaken' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, voiceId, description, language } = req.body;
    const voice = await prisma.voice.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(voiceId !== undefined && { voiceId }),
        ...(description !== undefined && { description }),
        ...(language !== undefined && { language }),
      },
    });
    res.json(voice);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Voice niet gevonden' });
    console.error('PUT /voices/:id error:', error);
    res.status(500).json({ error: 'Kon voice niet bijwerken' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.voice.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Voice niet gevonden' });
    console.error('DELETE /voices/:id error:', error);
    res.status(500).json({ error: 'Kon voice niet verwijderen' });
  }
});

// Seed default voices als de tabel leeg is
router.post('/seed', async (_req: Request, res: Response) => {
  try {
    const count = await prisma.voice.count();
    if (count > 0) return res.json({ message: 'Voices bestaan al', count });
    
    const defaults = [
      { name: "Dave", voiceId: "2pwMUCWPsm9t6AwXYaCj", description: "Australian Male", language: "en-AU" },
      { name: "Lucan Rook", voiceId: "15CVCzDByBinCIoCblXo", description: "Energetic Male", language: "en-US" },
      { name: "Alex", voiceId: "yl2ZDV1MzN4HbQJbMihG", description: "Young American Male", language: "en-US" },
      { name: "Archer", voiceId: "Fahco4VZzobUeiPqni1S", description: "Conversational", language: "en-US" },
      { name: "Pete", voiceId: "od84OdVweqzO3t6kKlWT", description: "UK Radio Host", language: "en-GB" },
      { name: "Scott", voiceId: "HqW11As4VRPkApNPkAZp", description: "Young Canadian Male", language: "en-CA" },
      { name: "Ali", voiceId: "uJgAp2HcS4msGNrkrmbb", description: "Arabic American", language: "en-US" },
      { name: "Brody", voiceId: "TbEd6wZh117FdOyTGS3q", description: "Crime Narrator", language: "en-US" },
      { name: "Brad", voiceId: "Dslrhjl3ZpzrctukrQSN", description: "Documentary", language: "en-US" },
      { name: "Jay", voiceId: "tFNXkg45n3yC6nHvEn2s", description: "African American", language: "en-US" },
    ];
    
    await prisma.voice.createMany({ data: defaults });
    res.json({ message: 'Default voices aangemaakt', count: defaults.length });
  } catch (error: any) {
    console.error('POST /voices/seed error:', error);
    res.status(500).json({ error: 'Seed mislukt' });
  }
});

export default router;
