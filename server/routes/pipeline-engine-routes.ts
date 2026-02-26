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
} from '../services/pipeline-engine.js';

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

export default router;
