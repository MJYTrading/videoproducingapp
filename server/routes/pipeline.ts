/**
 * Pipeline Routes
 * POST /api/projects/:id/execute-step/:stepNumber — Voer een pipeline stap uit
 * GET /api/projects/:id/step-result/:stepNumber — Haal resultaat op
 */

import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { executeStep0, executeStep1, executeStep2, executeStep3, executeStep6 } from '../services/pipeline.js';

const router = Router();

router.post('/:id/execute-step/:stepNumber', async (req: Request, res: Response) => {
  const { id } = req.params;
  const stepNumber = parseInt(req.params.stepNumber);

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: { steps: true },
    });
    if (!project) return res.status(404).json({ error: 'Project niet gevonden' });

    const projectData = {
      ...project,
      referenceVideos: JSON.parse(project.referenceVideos || '[]'),
      referenceClips: JSON.parse(project.referenceClips || '[]'),
      montageClips: JSON.parse(project.montageClips || '[]'),
      checkpoints: JSON.parse(project.checkpoints || '[]'),
    };

    let settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings) settings = await prisma.settings.create({ data: { id: 'singleton' } });

    const startedAt = new Date();
    await prisma.step.update({
      where: { projectId_stepNumber: { projectId: id, stepNumber } },
      data: { status: 'running', startedAt, firstAttemptAt: startedAt, error: null },
    });

    // Update project status naar running
    await prisma.project.update({
      where: { id },
      data: { status: 'running', startedAt: project.startedAt || startedAt },
    });

    const stepNames: Record<number, string> = {
      0: 'Config validatie', 1: 'Transcripts ophalen', 2: 'Style profile maken',
      3: 'Script schrijven', 6: 'Scene prompts genereren',
    };
    const source = stepNumber <= 1 || stepNumber === 12 ? 'App' : 'Elevate AI';

    await prisma.logEntry.create({
      data: { level: 'info', step: stepNumber, source, message: `${stepNames[stepNumber] || `Stap ${stepNumber}`} gestart...`, projectId: id },
    });

    // Antwoord meteen — stap draait op de achtergrond
    res.json({ status: 'started', stepNumber });

    // Voer stap async uit
    try {
      let result: any;
      let metadata: any = {};

      switch (stepNumber) {
        case 0: {
          const configResult = await executeStep0(projectData);
          if (!configResult.valid) throw new Error(`Validatie fouten: ${configResult.errors.join(', ')}`);
          result = { projectPath: configResult.projectPath };
          break;
        }
        case 1: {
          const transcriptResult = await executeStep1(projectData, settings.youtubeTranscriptApiKey);
          result = transcriptResult;
          metadata = { wordCount: transcriptResult.transcripts.reduce((sum: number, t: any) => sum + t.wordCount, 0) };
          if (transcriptResult.failures.length > 0) {
            await prisma.logEntry.create({
              data: { level: 'warn', step: 1, source: 'App', message: `${transcriptResult.failures.length} transcript(s) mislukt: ${transcriptResult.failures.map((f: any) => f.videoId).join(', ')}`, projectId: id },
            });
          }
          break;
        }
        case 2: {
          const styleProfile = await executeStep2(projectData, { elevateApiKey: settings.elevateApiKey, anthropicApiKey: settings.anthropicApiKey });
          result = styleProfile;
          metadata = { sections: styleProfile.script_formatting_rules?.sections };
          break;
        }
        case 3: {
          const scriptResult = await executeStep3(projectData, { elevateApiKey: settings.elevateApiKey, anthropicApiKey: settings.anthropicApiKey });
          result = { wordCount: scriptResult.wordCount, sections: scriptResult.sections, filePath: scriptResult.filePath };
          metadata = { wordCount: scriptResult.wordCount };
          break;
        }
        case 6: {
          const promptsResult = await executeStep6(projectData, { elevateApiKey: settings.elevateApiKey, anthropicApiKey: settings.anthropicApiKey });
          result = promptsResult;
          metadata = { sceneCount: promptsResult.totalScenes };
          break;
        }
        default:
          throw new Error(`Stap ${stepNumber} wordt nog niet ondersteund door de app. Gebruik N8N voor deze stap.`);
      }

      const duration = Math.round((Date.now() - startedAt.getTime()) / 1000);
      const checkpoints = JSON.parse(project.checkpoints || '[]');
      const isCheckpoint = checkpoints.includes(stepNumber);
      const newStatus = isCheckpoint ? 'review' : 'completed';

      await prisma.step.update({
        where: { projectId_stepNumber: { projectId: id, stepNumber } },
        data: {
          status: newStatus, duration,
          result: JSON.stringify(result),
          metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
          error: null,
        },
      });

      await prisma.logEntry.create({
        data: { level: 'info', step: stepNumber, source, message: `${stepNames[stepNumber] || `Stap ${stepNumber}`} voltooid (${duration}s)${isCheckpoint ? ' — wacht op review' : ''}`, projectId: id },
      });

      if (isCheckpoint) {
        await prisma.project.update({ where: { id }, data: { status: 'review' } });
      }

    } catch (stepError: any) {
      const duration = Math.round((Date.now() - startedAt.getTime()) / 1000);
      await prisma.step.update({
        where: { projectId_stepNumber: { projectId: id, stepNumber } },
        data: { status: 'failed', duration, error: stepError.message, retryCount: { increment: 1 } },
      });
      await prisma.logEntry.create({
        data: { level: 'error', step: stepNumber, source, message: `Stap ${stepNumber} mislukt: ${stepError.message}`, projectId: id },
      });
      await prisma.project.update({ where: { id }, data: { status: 'failed' } });
    }

  } catch (error: any) {
    console.error('Execute step error:', error);
    res.status(500).json({ error: error.message || 'Kon stap niet uitvoeren' });
  }
});

router.get('/:id/step-result/:stepNumber', async (req: Request, res: Response) => {
  try {
    const step = await prisma.step.findUnique({
      where: { projectId_stepNumber: { projectId: req.params.id, stepNumber: parseInt(req.params.stepNumber) } },
    });
    if (!step) return res.status(404).json({ error: 'Stap niet gevonden' });
    res.json({
      stepNumber: step.stepNumber, status: step.status, duration: step.duration, error: step.error,
      result: step.result ? JSON.parse(step.result) : null,
      metadata: step.metadata ? JSON.parse(step.metadata) : null,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Kon stap resultaat niet ophalen' });
  }
});

export default router;
