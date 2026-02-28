/**
 * Pipeline Engine Routes — nieuwe endpoints voor automatische pipeline
 * 
 * POST /api/pipeline/:id/start       — Start volledige pipeline
 * POST /api/pipeline/:id/pause       — Pauzeer pipeline
 * POST /api/pipeline/:id/resume      — Hervat pipeline
 * POST /api/pipeline/:id/approve/:step — Goedkeuren checkpoint
 * POST /api/pipeline/:id/feedback/:step — Feedback geven
 * POST /api/pipeline/:id/skip/:step   — Stap overslaan
 * POST /api/pipeline/:id/retry/:step  — Stap opnieuw proberen
 * POST /api/pipeline/:id/approve-scene — Scene goedkeuren (manual image mode)
 * GET  /api/pipeline/:id/status       — Live pipeline status
 */

import { Router, Request, Response } from 'express';
import {
  startPipeline,
  pausePipeline,
  resumePipeline,
  approveStep,
  submitFeedback,
  approveScene,
  skipStep,
  retryStep,
  getPipelineStatus,
  stopPipeline,
  startNextQueuedProject,
} from '../services/pipeline-engine.js';
import prisma from '../db.js';

const router = Router();

// Start de volledige pipeline (of hervat na crash)
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const result = await startPipeline(req.params.id);
    if (result.success) {
      res.json({ status: 'started', message: 'Pipeline gestart' });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Pipeline start error:', error);
    res.status(500).json({ error: error.message || 'Kon pipeline niet starten' });
  }
});

// Pauzeer de pipeline
router.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    const result = await pausePipeline(req.params.id);
    res.json({ status: 'paused', success: result.success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Hervat de pipeline
router.post('/:id/resume', async (req: Request, res: Response) => {
  try {
    const result = await resumePipeline(req.params.id);
    res.json({ status: 'resumed', success: result.success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Goedkeuren van een checkpoint stap
router.post('/:id/approve/:step', async (req: Request, res: Response) => {
  try {
    const stepNumber = parseInt(req.params.step);
    const result = await approveStep(req.params.id, stepNumber);
    res.json({ status: 'approved', step: stepNumber, success: result.success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Feedback geven op een checkpoint stap
router.post('/:id/feedback/:step', async (req: Request, res: Response) => {
  try {
    const stepNumber = parseInt(req.params.step);
    const { feedback } = req.body;
    if (!feedback) return res.status(400).json({ error: 'Feedback tekst is verplicht' });

    const result = await submitFeedback(req.params.id, stepNumber, feedback);
    res.json({ status: 'feedback_submitted', step: stepNumber, success: result.success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stap handmatig overslaan
router.post('/:id/skip/:step', async (req: Request, res: Response) => {
  try {
    const stepNumber = parseInt(req.params.step);
    const result = await skipStep(req.params.id, stepNumber);
    res.json({ status: 'skipped', step: stepNumber, success: result.success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stap opnieuw proberen
router.post('/:id/retry/:step', async (req: Request, res: Response) => {
  try {
    const stepNumber = parseInt(req.params.step);
    const result = await retryStep(req.params.id, stepNumber);
    res.json({ status: 'retrying', step: stepNumber, success: result.success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Scene goedkeuren in manual image mode (per scene → video start meteen)
router.post('/:id/approve-scene', async (req: Request, res: Response) => {
  try {
    const { sceneId, imagePath, clipOption } = req.body;
    if (!sceneId) return res.status(400).json({ error: 'sceneId is verplicht' });

    const result = await approveScene(
      req.params.id,
      parseInt(sceneId),
      imagePath || '',
      clipOption || 'natural'
    );
    res.json({ status: 'scene_approved', sceneId, success: result.success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Live pipeline status ophalen
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const status = getPipelineStatus(req.params.id);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Pipeline stoppen (hard stop)
router.post('/:id/stop', async (req: Request, res: Response) => {
  try {
    stopPipeline(req.params.id);
    res.json({ status: 'stopped', success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Wachtrij routes ──

// Wachtrij overzicht ophalen
router.get('/queue', async (_req: Request, res: Response) => {
  try {
    const queued = await prisma.project.findMany({
      where: { status: 'queued' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, title: true, priority: true, createdAt: true, visualStyle: true },
    });
    const running = await prisma.project.findFirst({
      where: { status: 'running' },
      select: { id: true, name: true, title: true, startedAt: true, visualStyle: true },
    });
    res.json({ running, queued });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Prioriteit aanpassen
router.patch('/queue/:id/priority', async (req: Request, res: Response) => {
  try {
    const { priority } = req.body;
    if (priority === undefined) return res.status(400).json({ error: 'priority is verplicht' });
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: { priority: Math.max(0, Math.min(10, parseInt(priority))) },
    });
    res.json({ id: project.id, name: project.name, priority: project.priority });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Project uit wachtrij halen (terug naar config)
router.post('/queue/:id/dequeue', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project || project.status !== 'queued') {
      return res.status(400).json({ error: 'Project staat niet in de wachtrij' });
    }
    await prisma.project.update({
      where: { id: req.params.id },
      data: { status: 'config' },
    });
    res.json({ success: true, message: 'Project uit wachtrij gehaald' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Forceer start volgende project uit wachtrij
router.post('/queue/start-next', async (_req: Request, res: Response) => {
  try {
    await startNextQueuedProject();
    res.json({ success: true, message: 'Volgende project wordt gestart' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

// Pipeline terugtrekken naar een specifieke stap
// Alle stappen VANAF targetStep worden gereset naar 'pending'
// Alle stappen VOOR targetStep blijven 'completed'
router.post('/:id/rollback/:step', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const targetStep = parseInt(req.params.step);
    
    if (isNaN(targetStep) || targetStep < 0 || targetStep > 25) {
      return res.status(400).json({ error: 'Ongeldig stapnummer (0-25)' });
    }

    // Pauzeer pipeline eerst
    try { await pausePipeline(projectId); } catch {}

    // Reset alle stappen >= targetStep naar pending
    const stepsReset = await prisma.step.updateMany({
      where: {
        projectId,
        stepNumber: { gte: targetStep },
      },
      data: {
        status: 'pending',
        result: null,
        error: null,
        duration: null,
        startedAt: null,
        retryCount: 0,
      },
    });

    // Zorg dat alle stappen < targetStep op completed staan (als ze niet skipped zijn)
    await prisma.step.updateMany({
      where: {
        projectId,
        stepNumber: { lt: targetStep },
        status: { notIn: ['completed', 'skipped'] },
      },
      data: { status: 'completed' },
    });

    // Zet project op paused zodat gebruiker op 'Hervatten' kan klikken
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'paused' },
    });

    const stepName = await prisma.step.findFirst({
      where: { projectId, stepNumber: targetStep },
      select: { name: true },
    });

    console.log(`[Pipeline] Rollback naar stap ${targetStep} (${stepName?.name}) — ${stepsReset.count} stappen gereset`);

    res.json({
      success: true,
      targetStep,
      stepName: stepName?.name || `Stap ${targetStep}`,
      stepsReset: stepsReset.count,
      message: `Pipeline teruggetrokken naar stap ${targetStep}. Klik Hervatten om te starten.`,
    });
  } catch (error: any) {
    console.error('Pipeline rollback error:', error);
    res.status(500).json({ error: error.message || 'Rollback mislukt' });
  }
});
