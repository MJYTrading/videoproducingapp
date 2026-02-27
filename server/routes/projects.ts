import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { DEFAULT_STEPS } from '../defaultSteps.js';

const router = Router();

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
    enabledSteps: JSON.parse(p.enabledSteps || '[]'),
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
      result: s.result ? JSON.parse(s.result) : undefined,
      aiResponse: s.aiResponse ? JSON.parse(s.aiResponse) : undefined,
      attemptNumber: s.attemptNumber,
      metadata: s.metadata ? JSON.parse(s.metadata) : undefined,
    })),
    logs: (p.logs || []).map((l: any) => ({
      id: l.id, timestamp: l.timestamp, level: l.level,
      step: l.step, source: l.source, message: l.message,
    })),
  };
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      include: { steps: { orderBy: { stepNumber: 'asc' } }, logs: { orderBy: { timestamp: 'desc' }, take: 50 } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(projects.map(formatProject));
  } catch (error: any) {
    console.error('GET /projects error:', error);
    res.status(500).json({ error: 'Kon projecten niet ophalen' });
  }
});

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

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const project = await prisma.project.create({
      data: {
        name: data.name, title: data.title, description: data.description || null,
        language: data.language || 'EN', scriptSource: data.scriptSource || 'new',
        referenceVideos: JSON.stringify(data.referenceVideos || []),
        scriptLength: data.scriptLength || null, scriptUrl: data.scriptUrl || null,
        voice: data.voice, backgroundMusic: data.backgroundMusic ?? false,
        visualStyle: data.visualStyle, visualStyleParent: data.visualStyleParent || null,
        customVisualStyle: data.customVisualStyle || null,
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
        output: data.output || 'YouTube 1080p',
        aspectRatio: data.aspectRatio || 'landscape',
        priority: data.priority || 0,
        channelId: data.channelId || null,
        status: 'config',
        enabledSteps: JSON.stringify(data.enabledSteps || []),
        steps: {
          create: DEFAULT_STEPS.map((s) => {
            const enabled = data.enabledSteps ? data.enabledSteps.includes(s.stepNumber) : true;
            const isReady = s.readyToUse;
            return {
              stepNumber: s.stepNumber, name: s.name, executor: s.executor,
              status: (!enabled || !isReady) ? 'skipped' : 'waiting',
            };
          }),
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

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const updateData: any = {};
    const directFields = [
      'name', 'title', 'description', 'language', 'scriptSource',
      'scriptLength', 'scriptUrl', 'voice', 'backgroundMusic',
      'visualStyle', 'visualStyleParent', 'customVisualStyle',
      'imageSelectionMode', 'imagesPerScene', 'transitionMode',
      'uniformTransition', 'useClips', 'stockImages', 'colorGrading',
      'subtitles', 'output', 'status', 'startedAt', 'completedAt',
      'aspectRatio', 'priority', 'queuePosition', 'channelId', 'enabledSteps',
    ];
    for (const field of directFields) {
      if (data[field] !== undefined) updateData[field] = data[field];
    }
    const jsonFields = [
      'referenceVideos', 'selectedImages', 'sceneTransitions',
      'referenceClips', 'montageClips', 'checkpoints', 'feedbackHistory',
    ];
    for (const field of jsonFields) {
      if (data[field] !== undefined) updateData[field] = JSON.stringify(data[field]);
    }
    const project = await prisma.project.update({
      where: { id: req.params.id }, data: updateData,
      include: { steps: { orderBy: { stepNumber: 'asc' } }, logs: { orderBy: { timestamp: 'desc' }, take: 50 } },
    });
    res.json(formatProject(project));
  } catch (error: any) {
    console.error('PATCH /projects/:id error:', error);
    res.status(500).json({ error: 'Kon project niet updaten' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error: any) {
    console.error('DELETE /projects/:id error:', error);
    res.status(500).json({ error: 'Kon project niet verwijderen' });
  }
});

router.post('/:id/duplicate', async (req: Request, res: Response) => {
  try {
    const original = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!original) return res.status(404).json({ error: 'Project niet gevonden' });
    const { id, createdAt, updatedAt, startedAt, completedAt, ...rest } = original;
    const project = await prisma.project.create({
      data: {
        ...rest, name: original.name + '-copy', status: 'config', feedbackHistory: JSON.stringify([]),
        steps: { create: DEFAULT_STEPS.map((s) => ({ stepNumber: s.stepNumber, name: s.name, executor: s.executor, status: 'waiting' })) },
      },
      include: { steps: { orderBy: { stepNumber: 'asc' } }, logs: true },
    });
    res.status(201).json(formatProject(project));
  } catch (error: any) {
    console.error('POST /projects/:id/duplicate error:', error);
    res.status(500).json({ error: 'Kon project niet dupliceren' });
  }
});

router.patch('/:id/steps/:stepNumber', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stepNumber = parseInt(req.params.stepNumber);
    const data = req.body;
    const updateData: any = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.duration !== undefined) updateData.duration = data.duration;
    if (data.error !== undefined) updateData.error = data.error;
    if (data.retryCount !== undefined) updateData.retryCount = data.retryCount;
    if (data.startedAt !== undefined) updateData.startedAt = data.startedAt ? new Date(data.startedAt) : null;
    if (data.firstAttemptAt !== undefined) updateData.firstAttemptAt = data.firstAttemptAt ? new Date(data.firstAttemptAt) : null;
    if (data.result !== undefined) updateData.result = data.result ? JSON.stringify(data.result) : null;
    if (data.aiResponse !== undefined) updateData.aiResponse = data.aiResponse ? JSON.stringify(data.aiResponse) : null;
    if (data.attemptNumber !== undefined) updateData.attemptNumber = data.attemptNumber;
    if (data.metadata !== undefined) updateData.metadata = data.metadata ? JSON.stringify(data.metadata) : null;
    const step = await prisma.step.update({
      where: { projectId_stepNumber: { projectId: id, stepNumber } },
      data: updateData,
    });
    res.json({
      id: step.stepNumber, name: step.name, executor: step.executor,
      status: step.status, duration: step.duration, error: step.error,
      retryCount: step.retryCount, startedAt: step.startedAt,
      firstAttemptAt: step.firstAttemptAt,
      result: step.result ? JSON.parse(step.result) : undefined,
      aiResponse: step.aiResponse ? JSON.parse(step.aiResponse) : undefined,
      attemptNumber: step.attemptNumber,
      metadata: step.metadata ? JSON.parse(step.metadata) : undefined,
    });
  } catch (error: any) {
    console.error('PATCH step error:', error);
    res.status(500).json({ error: 'Kon stap niet updaten' });
  }
});

router.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = await prisma.logEntry.findMany({
      where: { projectId: req.params.id },
      orderBy: { timestamp: 'desc' }, take: limit,
    });
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: 'Kon logs niet ophalen' });
  }
});

router.post('/:id/logs', async (req: Request, res: Response) => {
  try {
    const { level, step, source, message } = req.body;
    const log = await prisma.logEntry.create({
      data: { level, step, source, message, projectId: req.params.id },
    });
    res.status(201).json(log);
  } catch (error: any) {
    res.status(500).json({ error: 'Kon log niet toevoegen' });
  }
});

export default router;
