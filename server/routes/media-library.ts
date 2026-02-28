import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// Veilige JSON parse — voorkomt crashes bij plain strings zoals "dark" ipv '["dark"]'
function safeJsonParse(val: any, fallback: any = []): any {
  if (!val) return fallback;
  try { return JSON.parse(val); }
  catch { return typeof val === 'string' ? [val] : fallback; }
}

// ══════════════════════════════════════════════════
//  MUZIEK LIBRARY
// ══════════════════════════════════════════════════

router.get('/music', async (_req: Request, res: Response) => {
  try {
    const tracks = await prisma.musicTrack.findMany({
      orderBy: { createdAt: 'desc' },
      include: { channelSelections: { select: { channelId: true } } },
    });
    res.json(tracks.map(t => ({
      ...t,
      mood: safeJsonParse(t.mood, []),
      tags: safeJsonParse(t.tags, []),
      assignedChannels: t.channelSelections.map(s => s.channelId),
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/music', async (req: Request, res: Response) => {
  try {
    const { title, filePath, duration, mood, genre, bpm, energyProfile, hasVocals, loopable, tags } = req.body;
    if (!title || !filePath) return res.status(400).json({ error: 'title en filePath zijn verplicht' });

    const track = await prisma.musicTrack.create({
      data: {
        title, filePath,
        duration: duration || 0,
        mood: JSON.stringify(mood || []),
        genre: genre || 'other',
        bpm: bpm || null,
        energyProfile: energyProfile || null,
        hasVocals: hasVocals || false,
        loopable: loopable || false,
        tags: JSON.stringify(tags || []),
      },
    });
    res.status(201).json(track);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/music/:id', async (req: Request, res: Response) => {
  try {
    const { title, duration, mood, genre, bpm, energyProfile, hasVocals, loopable, tags } = req.body;
    const track = await prisma.musicTrack.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(duration !== undefined && { duration }),
        ...(mood !== undefined && { mood: JSON.stringify(mood) }),
        ...(genre !== undefined && { genre }),
        ...(bpm !== undefined && { bpm }),
        ...(energyProfile !== undefined && { energyProfile }),
        ...(hasVocals !== undefined && { hasVocals }),
        ...(loopable !== undefined && { loopable }),
        ...(tags !== undefined && { tags: JSON.stringify(tags) }),
      },
    });
    res.json(track);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Track niet gevonden' });
    res.status(500).json({ error: error.message });
  }
});

router.delete('/music/:id', async (req: Request, res: Response) => {
  try {
    await prisma.musicTrack.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Track niet gevonden' });
    res.status(500).json({ error: error.message });
  }
});

// Assign music to channel
router.post('/music/:id/assign', async (req: Request, res: Response) => {
  try {
    const { channelIds } = req.body;
    if (!Array.isArray(channelIds)) return res.status(400).json({ error: 'channelIds array verplicht' });

    await prisma.channelMusicSelection.deleteMany({ where: { musicTrackId: req.params.id } });
    for (const channelId of channelIds) {
      await prisma.channelMusicSelection.create({
        data: { channelId, musicTrackId: req.params.id },
      });
    }
    res.json({ success: true, assigned: channelIds.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
//  SFX LIBRARY
// ══════════════════════════════════════════════════

router.get('/sfx', async (_req: Request, res: Response) => {
  try {
    const effects = await prisma.soundEffect.findMany({
      orderBy: { createdAt: 'desc' },
      include: { channelSelections: { select: { channelId: true } } },
    });
    res.json(effects.map(e => ({
      ...e,
      tags: safeJsonParse(e.tags, []),
      assignedChannels: e.channelSelections.map(s => s.channelId),
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sfx', async (req: Request, res: Response) => {
  try {
    const { name, filePath, duration, category, intensity, usageGuide, tags } = req.body;
    if (!name || !filePath) return res.status(400).json({ error: 'name en filePath zijn verplicht' });

    const effect = await prisma.soundEffect.create({
      data: {
        name, filePath,
        duration: duration || 0,
        category: category || 'other',
        intensity: intensity || 'medium',
        usageGuide: usageGuide || null,
        tags: JSON.stringify(tags || []),
      },
    });
    res.status(201).json(effect);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/sfx/:id', async (req: Request, res: Response) => {
  try {
    const { name, duration, category, intensity, usageGuide, tags } = req.body;
    const effect = await prisma.soundEffect.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(duration !== undefined && { duration }),
        ...(category !== undefined && { category }),
        ...(intensity !== undefined && { intensity }),
        ...(usageGuide !== undefined && { usageGuide }),
        ...(tags !== undefined && { tags: JSON.stringify(tags) }),
      },
    });
    res.json(effect);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'SFX niet gevonden' });
    res.status(500).json({ error: error.message });
  }
});

router.delete('/sfx/:id', async (req: Request, res: Response) => {
  try {
    await prisma.soundEffect.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'SFX niet gevonden' });
    res.status(500).json({ error: error.message });
  }
});

// Assign SFX to channel
router.post('/sfx/:id/assign', async (req: Request, res: Response) => {
  try {
    const { channelIds } = req.body;
    await prisma.channelSfxSelection.deleteMany({ where: { soundEffectId: req.params.id } });
    for (const channelId of channelIds) {
      await prisma.channelSfxSelection.create({
        data: { channelId, soundEffectId: req.params.id },
      });
    }
    res.json({ success: true, assigned: channelIds.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
//  OVERLAY PRESETS
// ══════════════════════════════════════════════════

router.get('/overlays', async (_req: Request, res: Response) => {
  try {
    const presets = await prisma.overlayPreset.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(presets.map(p => ({ ...p, layers: safeJsonParse(p.layers, []) })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/overlays', async (req: Request, res: Response) => {
  try {
    const { name, layers } = req.body;
    if (!name) return res.status(400).json({ error: 'name is verplicht' });

    const preset = await prisma.overlayPreset.create({
      data: { name, layers: JSON.stringify(layers || []) },
    });
    res.status(201).json({ ...preset, layers: safeJsonParse(preset.layers, []) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/overlays/:id', async (req: Request, res: Response) => {
  try {
    const { name, layers } = req.body;
    const preset = await prisma.overlayPreset.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(layers !== undefined && { layers: JSON.stringify(layers) }),
      },
    });
    res.json({ ...preset, layers: safeJsonParse(preset.layers, []) });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Preset niet gevonden' });
    res.status(500).json({ error: error.message });
  }
});

router.delete('/overlays/:id', async (req: Request, res: Response) => {
  try {
    await prisma.overlayPreset.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Preset niet gevonden' });
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════
//  SPECIAL EDITS
// ══════════════════════════════════════════════════

router.get('/special-edits', async (_req: Request, res: Response) => {
  try {
    const edits = await prisma.specialEdit.findMany({
      orderBy: { createdAt: 'desc' },
      include: { channelSelections: { select: { channelId: true } } },
    });
    res.json(edits.map(e => ({
      ...e,
      assignedChannels: e.channelSelections.map(s => s.channelId),
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/special-edits', async (req: Request, res: Response) => {
  try {
    const { name, description, scriptPath, parameters, applicableFor, usageGuide } = req.body;
    if (!name) return res.status(400).json({ error: 'name is verplicht' });

    const edit = await prisma.specialEdit.create({
      data: {
        name,
        description: description || '',
        scriptPath: scriptPath || '',
        parameters: parameters || '{}',
        applicableFor: JSON.stringify(applicableFor || []),
        usageGuide: usageGuide || null,
      },
    });
    res.status(201).json(edit);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/special-edits/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, scriptPath, parameters, applicableFor, usageGuide } = req.body;
    const edit = await prisma.specialEdit.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(scriptPath !== undefined && { scriptPath }),
        ...(parameters !== undefined && { parameters }),
        ...(applicableFor !== undefined && { applicableFor: JSON.stringify(applicableFor) }),
        ...(usageGuide !== undefined && { usageGuide }),
      },
    });
    res.json(edit);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Edit niet gevonden' });
    res.status(500).json({ error: error.message });
  }
});

router.delete('/special-edits/:id', async (req: Request, res: Response) => {
  try {
    await prisma.specialEdit.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Edit niet gevonden' });
    res.status(500).json({ error: error.message });
  }
});

// Assign special edit to channel
router.post('/special-edits/:id/assign', async (req: Request, res: Response) => {
  try {
    const { channelIds } = req.body;
    await prisma.channelSpecialEditSelection.deleteMany({ where: { specialEditId: req.params.id } });
    for (const channelId of channelIds) {
      await prisma.channelSpecialEditSelection.create({
        data: { channelId, specialEditId: req.params.id },
      });
    }
    res.json({ success: true, assigned: channelIds.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
