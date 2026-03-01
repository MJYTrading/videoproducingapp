import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// ─── Helper: format project voor frontend ───
function formatProject(p: any) {
  return {
    ...p,
    referenceVideos: JSON.parse(p.referenceVideos || '[]'),
    selectedImages: JSON.parse(p.selectedImages || '[]'),
    sceneTransitions: JSON.parse(p.sceneTransitions || '[]'),
    referenceClips: JSON.parse(p.referenceClips || '[]'),
    montageClips: JSON.parse(p.montageClips || '[]'),
    checkpoints: JSON.parse(p.checkpoints || '[]'),
    feedbackHistory: JSON.parse(p.feedbackHistory || '[]'),
    steps: (p.steps || []).map((s: any) => ({
      id: s.stepNumber,
      name: s.name,
      executor: s.executor,
      status: s.status,
      duration: s.duration,
      error: s.error,
      retryCount: s.retryCount,
      startedAt: s.startedAt,
      firstAttemptAt: s.firstAttemptAt,
      result: s.result ? (() => { try { return JSON.parse(s.result); } catch { return s.result; } })() : null,
      aiResponse: s.aiResponse ? (() => { try { return JSON.parse(s.aiResponse); } catch { return null; } })() : null,
      attemptNumber: s.attemptNumber,
      metadata: s.metadata ? (() => { try { return JSON.parse(s.metadata); } catch { return null; } })() : null,
    })),
    logs: (p.logs || []).map((l: any) => ({
      id: l.id, timestamp: l.timestamp, level: l.level,
      step: l.step, source: l.source, message: l.message,
      detail: l.detail, durationMs: l.durationMs,
    })),
  };
}

// ─── Helper: laad pipeline stappen uit DB op basis van videoType ───
async function getPipelineStepsForVideoType(videoType: string): Promise<Array<{ stepNumber: number; name: string; executor: string }>> {
  const pipeline = await prisma.pipeline.findFirst({
    where: { slug: videoType, isActive: true },
    include: {
      nodes: {
        where: { isActive: true },
        include: { stepDefinition: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!pipeline || pipeline.nodes.length === 0) {
    console.warn(`[Projects] Geen actieve pipeline gevonden voor videoType: ${videoType}, gebruik fallback`);
    // Minimale fallback zodat er altijd stappen zijn
    return [
      { stepNumber: 0, name: 'Config Validatie', executor: 'App' },
    ];
  }

  return pipeline.nodes.map((node: any) => ({
    stepNumber: node.sortOrder,
    name: node.stepDefinition.name,
    executor: node.stepDefinition.executorLabel || 'App',
  }));
}

// ─── GET /projects ───
router.get('/', async (_req: Request, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: { steps: { orderBy: { stepNumber: 'asc' } }, logs: { orderBy: { timestamp: 'desc' }, take: 50 } },
    });
    res.json(projects.map(formatProject));
  } catch (error: any) {
    console.error('GET /projects error:', error);
    res.status(500).json({ error: 'Kon projecten niet ophalen' });
  }
});

// ─── GET /projects/:id ───
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { steps: { orderBy: { stepNumber: 'asc' } }, logs: { orderBy: { timestamp: 'desc' } } },
    });
    if (!project) return res.status(404).json({ error: 'Project niet gevonden' });
    res.json(formatProject(project));
  } catch (error: any) {
    console.error('GET /projects/:id error:', error);
    res.status(500).json({ error: 'Kon project niet ophalen' });
  }
});

// ─── POST /projects (aanmaken) ───
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const videoType = data.videoType || 'ai';

    // Laad pipeline stappen dynamisch uit DB
    const pipelineSteps = await getPipelineStepsForVideoType(videoType);

    const project = await prisma.project.create({
      data: {
        name: data.name,
        title: data.title,
        description: data.description || '',
        language: data.language || 'EN',
        scriptSource: data.scriptSource || 'new',
        referenceVideos: JSON.stringify(data.referenceVideos || []),
        scriptLength: data.scriptLength || 5000,
        scriptUrl: data.scriptUrl || '',
        voice: data.voice || '',
        backgroundMusic: data.backgroundMusic ?? true,
        visualStyle: data.visualStyle || '',
        visualStyleParent: data.visualStyleParent || null,
        customVisualStyle: data.customVisualStyle || '',
        imageSelectionMode: data.imageSelectionMode || 'auto',
        imagesPerScene: data.imagesPerScene || 1,
        selectedImages: JSON.stringify(data.selectedImages || []),
        transitionMode: data.transitionMode || 'none',
        uniformTransition: data.uniformTransition || null,
        sceneTransitions: JSON.stringify(data.sceneTransitions || []),
        useClips: data.useClips ?? false,
        referenceClips: JSON.stringify(data.referenceClips || []),
        montageClips: JSON.stringify(data.montageClips || []),
        stockImages: data.stockImages ?? false,
        checkpoints: JSON.stringify(data.checkpoints || []),
        feedbackHistory: JSON.stringify([]),
        colorGrading: data.colorGrading || 'Geen',
        subtitles: data.subtitles ?? true,
        subtitleStyle: data.subtitleStyle || 'modern',
        output: data.output || 'YouTube 1080p',
        aspectRatio: data.aspectRatio || 'landscape',
        priority: data.priority || 0,
        channelId: data.channelId || null,
        videoType,
        status: 'config',
        enabledSteps: '[]', // Niet meer gebruikt, pipeline bepaalt stappen
        steps: {
          create: pipelineSteps.map((s) => ({
            stepNumber: s.stepNumber,
            name: s.name,
            executor: s.executor,
            status: 'waiting',
          })),
        },
      },
      include: { steps: { orderBy: { stepNumber: 'asc' } }, logs: true },
    });
    res.status(201).json(formatProject(project));
  } catch (error: any) {
    console.error('POST /projects error:', error);
    res.status(500).json({ error: 'Kon project niet aanmaken' });
  }
});

// ─── PATCH /projects/:id ───
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const updateData: any = {};

    // Alle velden die geüpdatet mogen worden
    const simpleFields = [
      'name', 'title', 'description', 'language', 'scriptSource', 'scriptLength',
      'scriptUrl', 'voice', 'backgroundMusic', 'visualStyle', 'visualStyleParent',
      'customVisualStyle', 'imageSelectionMode', 'imagesPerScene', 'transitionMode',
      'uniformTransition', 'useClips', 'stockImages', 'colorGrading', 'subtitles',
      'subtitleStyle', 'output', 'status', 'startedAt', 'completedAt',
      'aspectRatio', 'priority', 'queuePosition', 'channelId',
      'videoType', 'driveUrl',
    ];

    for (const field of simpleFields) {
      if (data[field] !== undefined) updateData[field] = data[field];
    }

    // JSON velden
    const jsonFields = ['referenceVideos', 'selectedImages', 'sceneTransitions',
      'referenceClips', 'montageClips', 'checkpoints', 'feedbackHistory'];
    for (const field of jsonFields) {
      if (data[field] !== undefined) updateData[field] = JSON.stringify(data[field]);
    }

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: updateData,
      include: { steps: { orderBy: { stepNumber: 'asc' } }, logs: { orderBy: { timestamp: 'desc' }, take: 50 } },
    });
    res.json(formatProject(project));
  } catch (error: any) {
    console.error('PATCH /projects/:id error:', error);
    res.status(500).json({ error: 'Kon project niet updaten' });
  }
});

// ─── DELETE /projects/:id ───
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error: any) {
    console.error('DELETE /projects/:id error:', error);
    res.status(500).json({ error: 'Kon project niet verwijderen' });
  }
});

// ─── POST /projects/:id/duplicate ───
router.post('/:id/duplicate', async (req: Request, res: Response) => {
  try {
    const original = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!original) return res.status(404).json({ error: 'Project niet gevonden' });

    const videoType = original.videoType || 'ai';
    const pipelineSteps = await getPipelineStepsForVideoType(videoType);

    const { id, createdAt, updatedAt, startedAt, completedAt, ...rest } = original;
    const project = await prisma.project.create({
      data: {
        ...rest,
        name: original.name + '-copy',
        status: 'config',
        feedbackHistory: JSON.stringify([]),
        enabledSteps: '[]',
        steps: {
          create: pipelineSteps.map((s) => ({
            stepNumber: s.stepNumber,
            name: s.name,
            executor: s.executor,
            status: 'waiting',
          })),
        },
      },
      include: { steps: { orderBy: { stepNumber: 'asc' } }, logs: true },
    });
    res.status(201).json(formatProject(project));
  } catch (error: any) {
    console.error('POST /projects/:id/duplicate error:', error);
    res.status(500).json({ error: 'Kon project niet dupliceren' });
  }
});

// ─── PATCH /projects/:id/steps/:stepNumber ───
router.patch('/:id/steps/:stepNumber', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const stepNumber = parseInt(req.params.stepNumber);
    const data = req.body;

    const updateData: any = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.duration !== undefined) updateData.duration = data.duration;
    if (data.error !== undefined) updateData.error = data.error;
    if (data.retryCount !== undefined) updateData.retryCount = data.retryCount;
    if (data.result !== undefined) updateData.result = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
    if (data.aiResponse !== undefined) updateData.aiResponse = typeof data.aiResponse === 'string' ? data.aiResponse : JSON.stringify(data.aiResponse);
    if (data.startedAt !== undefined) updateData.startedAt = data.startedAt;
    if (data.firstAttemptAt !== undefined) updateData.firstAttemptAt = data.firstAttemptAt;
    if (data.metadata !== undefined) updateData.metadata = typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata);
    if (data.attemptNumber !== undefined) updateData.attemptNumber = data.attemptNumber;

    const step = await prisma.step.update({
      where: { projectId_stepNumber: { projectId: id, stepNumber } },
      data: updateData,
    });

    res.json({
      id: step.stepNumber, name: step.name, executor: step.executor,
      status: step.status, duration: step.duration, error: step.error,
    });
  } catch (error: any) {
    console.error('PATCH /projects/:id/steps/:stepNumber error:', error);
    res.status(500).json({ error: 'Kon stap niet updaten' });
  }
});

// ─── POST /projects/:id/log ───
router.post('/:id/log', async (req: Request, res: Response) => {
  try {
    const { level, step, source, message } = req.body;
    const log = await prisma.logEntry.create({
      data: { level, step, source, message, projectId: req.params.id },
    });
    res.status(201).json(log);
  } catch (error: any) {
    console.error('POST /projects/:id/log error:', error);
    res.status(500).json({ error: 'Kon log niet toevoegen' });
  }
});

// ─── GET /projects/:id/file/:filePath ───
router.get('/:id/file/*', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project niet gevonden' });

    const filePath = req.params[0];
    const path = await import('path');
    const fs = await import('fs/promises');
    const fullPath = path.join(process.cwd(), 'projects', project.name, filePath);

    const content = await fs.readFile(fullPath, 'utf-8');
    try {
      res.json(JSON.parse(content));
    } catch {
      res.type('text').send(content);
    }
  } catch (error: any) {
    res.status(404).json({ error: 'Bestand niet gevonden' });
  }
});

// ─── Pipeline info endpoint — frontend kan pipeline nodes ophalen ───
router.get('/:id/pipeline-info', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project niet gevonden' });

    const pipeline = await prisma.pipeline.findFirst({
      where: { slug: project.videoType, isActive: true },
      include: {
        nodes: {
          where: { isActive: true },
          include: { stepDefinition: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!pipeline) return res.status(404).json({ error: 'Pipeline niet gevonden' });

    res.json({
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      nodes: pipeline.nodes.map((n: any) => ({
        sortOrder: n.sortOrder,
        name: n.stepDefinition.name,
        slug: n.stepDefinition.slug,
        executor: n.stepDefinition.executorLabel || 'App',
        isCheckpoint: n.isCheckpoint,
        category: n.stepDefinition.category,
      })),
    });
  } catch (error: any) {
    console.error('GET /projects/:id/pipeline-info error:', error);
    res.status(500).json({ error: 'Kon pipeline info niet ophalen' });
  }
});

export default router;
