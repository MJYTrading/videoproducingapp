/**
 * Clip Search Route — zoekt vervangende clips via Sonar (Perplexity)
 * 
 * POST /api/projects/:id/clip-search
 * Body: { clipUrl, startTime, endTime, feedback, scriptContext, language }
 * 
 * Returns: { clips: [{ url, startTime, endTime, reason }] }
 */
import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { callLLM, LLM_MODELS } from '../services/llm.js';

const router = Router();

router.post('/:id/clip-search', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { clipUrl, startTime, endTime, feedback, scriptContext, language } = req.body;

    if (!feedback && !scriptContext) {
      return res.status(400).json({ error: 'feedback of scriptContext is verplicht' });
    }

    // Haal project + settings op
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return res.status(404).json({ error: 'Project niet gevonden' });

    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings?.elevateApiKey && !settings?.perplexityApiKey) {
      return res.status(400).json({ error: 'Geen API key geconfigureerd voor clip zoeken' });
    }

    const keys = {
      elevateApiKey: settings.elevateApiKey || undefined,
      perplexityApiKey: settings.perplexityApiKey || undefined,
    };

    const systemPrompt = `You are a YouTube clip research assistant. Your task is to find replacement video clips on YouTube that fit a specific context in a video script.

You will receive:
- The original clip that was rejected (URL + timestamps)
- Feedback on why it was rejected
- The surrounding script context
- The video language

Find 3 alternative YouTube clips that:
1. Are relevant to the script context
2. Address the feedback/rejection reason
3. Are from reputable/popular YouTube channels
4. Have specific timestamps for the relevant section

IMPORTANT: 
- Only suggest clips from youtube.com
- Provide specific start and end timestamps (MM:SS format)
- Keep clip duration between 8-30 seconds
- Explain why each clip is a good replacement

Respond ONLY in this exact JSON format (no markdown, no backticks):
{
  "clips": [
    {
      "url": "https://www.youtube.com/watch?v=VIDEO_ID",
      "startTime": "MM:SS",
      "endTime": "MM:SS", 
      "title": "Video title",
      "channel": "Channel name",
      "reason": "Why this clip fits the context"
    }
  ]
}`;

    const userPrompt = `Find replacement clips for this rejected clip:

REJECTED CLIP: ${clipUrl} (${startTime} - ${endTime})
REJECTION REASON: ${feedback || 'Not specified'}

SCRIPT CONTEXT (surrounding text):
"""
${scriptContext || 'No context provided'}
"""

VIDEO TOPIC: ${project.title}
LANGUAGE: ${language || project.language || 'EN'}

Find 3 YouTube clips that better fit this context. Remember to provide specific timestamps.`;

    const result = await callLLM(keys, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], {
      model: LLM_MODELS.SONAR,
      maxTokens: 2000,
      temperature: 0.5,
    });

    // Parse JSON response
    const cleaned = result.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Probeer JSON uit de response te extraheren
      const jsonMatch = cleaned.match(/\{[\s\S]*"clips"[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Kon geen clips parsen uit LLM response');
      }
    }

    // Valideer en enricheer clips met videoId
    const clips = (parsed.clips || []).map((clip: any) => ({
      ...clip,
      videoId: extractVideoId(clip.url),
    }));

    await prisma.logEntry.create({
      data: {
        projectId: id,
        level: 'info',
        step: 7,
        source: 'Clip Search',
        message: `Vervangende clips gezocht: ${clips.length} resultaten gevonden`,
        detail: JSON.stringify({ feedback, originalClip: clipUrl, results: clips.length }),
      },
    });

    res.json({ clips, provider: result.provider, model: result.model });
  } catch (error: any) {
    console.error('[ClipSearch] Error:', error.message);
    res.status(500).json({ error: error.message || 'Clip zoeken mislukt' });
  }
});

// Save clip review decisions
router.post('/:id/clip-review', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { clips } = req.body;

    if (!Array.isArray(clips)) {
      return res.status(400).json({ error: 'clips array is verplicht' });
    }

    // Sla clip review op in Step metadata
    const step = await prisma.step.findUnique({
      where: { projectId_stepNumber: { projectId: id, stepNumber: 7 } },
    });

    if (!step) return res.status(404).json({ error: 'Script stap niet gevonden' });

    const existingMeta = step.metadata ? JSON.parse(step.metadata) : {};
    const updatedMeta = {
      ...existingMeta,
      clipReview: {
        reviewedAt: new Date().toISOString(),
        clips: clips.map((c: any) => ({
          index: c.index,
          url: c.url,
          startTime: c.startTime,
          endTime: c.endTime,
          status: c.status,
          feedback: c.feedback || null,
          replacement: c.replacement || null,
        })),
        approvedCount: clips.filter((c: any) => c.status === 'approved').length,
        rejectedCount: clips.filter((c: any) => c.status === 'rejected').length,
        replacedCount: clips.filter((c: any) => c.replacement).length,
      },
    };

    // Update het script in step result met vervangen clips
    let updatedResult = step.result ? JSON.parse(step.result) : {};
    const scriptText = updatedResult.script || '';
    
    if (scriptText) {
      let newScript = scriptText;
      // Vervang rejected clips die een replacement hebben
      for (const clip of clips) {
        if (clip.status === 'rejected' && clip.replacement) {
          const oldClipPattern = `[CLIP: ${clip.url} ${clip.startTime} - ${clip.endTime}]`;
          const newClipText = `[CLIP: ${clip.replacement.url} ${clip.replacement.startTime} - ${clip.replacement.endTime}]`;
          newScript = newScript.replace(oldClipPattern, newClipText);
        }
      }
      updatedResult.script = newScript;
      updatedResult.scriptVoiceover = updatedResult.scriptVoiceover; // Behoud voiceover versie
    }

    await prisma.step.update({
      where: { projectId_stepNumber: { projectId: id, stepNumber: 7 } },
      data: {
        metadata: JSON.stringify(updatedMeta),
        result: JSON.stringify(updatedResult),
        status: 'completed', // Van 'review' naar 'completed'
      },
    });

    // Update project status zodat pipeline kan doorgaan
    await prisma.project.update({
      where: { id },
      data: { status: 'in_progress' },
    });

    await prisma.logEntry.create({
      data: {
        projectId: id,
        level: 'info',
        step: 7,
        source: 'Clip Review',
        message: `Script clip review voltooid: ${updatedMeta.clipReview.approvedCount} approved, ${updatedMeta.clipReview.rejectedCount} rejected, ${updatedMeta.clipReview.replacedCount} replaced`,
      },
    });

    res.json({ success: true, ...updatedMeta.clipReview });
  } catch (error: any) {
    console.error('[ClipReview] Error:', error.message);
    res.status(500).json({ error: error.message || 'Clip review opslaan mislukt' });
  }
});

function extractVideoId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export default router;
