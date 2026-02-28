/**
 * Pipeline Routes
 * POST /api/projects/:id/execute-step/:stepNumber — Voer een pipeline stap uit
 * GET /api/projects/:id/step-result/:stepNumber — Haal resultaat op
 */

import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { executeStep0, executeStep1, executeStep2, executeStep3, executeStep4, executeStep5, executeStep6, executeStep6b, executeStep7, executeStep8, executeStep9, executeStep10, executeStep11, executeStep12, executeStep13, executeStep14 } from '../services/pipeline.js';

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
      0: 'Ideation', 1: 'Project Formulier', 2: 'Research JSON',
      3: 'Transcripts Ophalen', 4: 'Trending Clips Research',
      5: 'Style Profile', 6: 'Script Schrijven', 7: 'Voice Over',
      8: 'Avatar / Spokesperson', 9: 'Timestamps Ophalen',
      10: 'Scene Prompts', 11: 'Assets Zoeken', 12: 'Clips Downloaden',
      13: 'Images Genereren', 14: 'Video Scenes Genereren',
      15: 'Orchestrator', 16: 'Achtergrondmuziek', 17: 'Color Grading',
      18: 'Subtitles', 19: 'Overlay', 20: 'Sound Effects',
      21: 'Video Effects', 22: 'Final Export', 23: 'Thumbnail', 24: 'Drive Upload',
    };
    const executorMap: Record<number, string> = {
      0: 'App', 1: 'App', 2: 'Perplexity', 3: 'App', 4: 'Perplexity',
      5: 'Elevate AI', 6: 'Elevate AI', 7: 'Elevate', 8: 'HeyGen',
      9: 'Assembly AI', 10: 'Elevate AI', 11: 'TwelveLabs + N8N', 12: 'N8N',
      13: 'Elevate', 14: 'Elevate', 15: 'Claude Opus', 16: 'FFMPEG',
      17: 'FFMPEG', 18: 'FFMPEG', 19: 'FFMPEG', 20: 'FFMPEG',
      21: 'FFMPEG', 22: 'FFMPEG', 23: 'App', 24: 'App',
    };
    const source = executorMap[stepNumber] || 'App';

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
        case 1: { // Project Formulier (was 0)
          const configResult = await executeStep0(projectData);
          if (!configResult.valid) throw new Error(`Validatie fouten: ${configResult.errors.join(', ')}`);
          result = { projectPath: configResult.projectPath };
          break;
        }
        case 3: { // Transcripts Ophalen (was 1)
          const transcriptResult = await executeStep1(projectData, settings.youtubeTranscriptApiKey);
          result = transcriptResult;
          metadata = { wordCount: transcriptResult.transcripts.reduce((sum: number, t: any) => sum + t.wordCount, 0) };
          if (transcriptResult.failures.length > 0) {
            await prisma.logEntry.create({
              data: { level: 'warn', step: stepNumber, source, message: `${transcriptResult.failures.length} transcript(s) mislukt`, projectId: id },
            });
          }
          break;
        }
        case 5: { // Style Profile (was 2)
          const styleProfile = await executeStep2(projectData, { elevateApiKey: settings.elevateApiKey, anthropicApiKey: settings.anthropicApiKey });
          result = styleProfile;
          metadata = { sections: styleProfile.script_formatting_rules?.sections };
          break;
        }
        case 6: { // Script Schrijven (was 3)
          const scriptResult = await executeStep3(projectData, { elevateApiKey: settings.elevateApiKey, anthropicApiKey: settings.anthropicApiKey });
          result = { wordCount: scriptResult.wordCount, sections: scriptResult.sections, filePath: scriptResult.filePath };
          metadata = { wordCount: scriptResult.wordCount };
          break;
        }
        case 7: { // Voice Over (was 4)
          const voiceoverResult = await executeStep4(projectData, settings);
          result = voiceoverResult;
          metadata = { fileSizeKb: voiceoverResult.fileSizeKb, voiceName: voiceoverResult.voiceName };
          break;
        }
        case 9: { // Timestamps (was 5)
          const timestampResult = await executeStep5(projectData, settings);
          result = timestampResult;
          metadata = { wordCount: timestampResult.wordCount, duration: timestampResult.duration, clipCount: timestampResult.clipCount };
          break;
        }
        case 10: { // Scene Prompts (was 6)
          const promptsResult = await executeStep6(projectData, { elevateApiKey: settings.elevateApiKey, anthropicApiKey: settings.anthropicApiKey });
          result = promptsResult;
          metadata = { sceneCount: promptsResult.totalScenes };
          break;
        }
        case 11: { // Assets Zoeken (was 7)
          const assetsResult = await executeStep7(projectData, settings);
          result = assetsResult;
          if (assetsResult.skipped) {
            metadata = { skipped: true, reason: assetsResult.reason };
          } else {
            metadata = { assetsFound: assetsResult.assetsFound, assetsFailed: assetsResult.assetsFailed };
          }
          break;
        }
        case 12: { // Clips Downloaden (was 8)
          const clipsResult = await executeStep8(projectData, settings);
          result = clipsResult;
          if (clipsResult.skipped) {
            metadata = { skipped: true, reason: clipsResult.reason };
          } else {
            metadata = { clipsDownloaded: clipsResult.clipsDownloaded, clipsFailed: clipsResult.clipsFailed };
          }
          break;
        }
        case 13: { // Images Genereren (was 6b/65)
          const imgResult = await executeStep6b(projectData, settings);
          result = imgResult;
          if (imgResult.skipped) {
            metadata = { skipped: true, reason: imgResult.reason };
          } else {
            metadata = { generated: imgResult.generated, failed: imgResult.failed };
          }
          break;
        }
        case 14: { // Video Scenes Genereren (was 9)
          const scenesResult = await executeStep9(projectData, settings);
          result = scenesResult;
          if (scenesResult.skipped) {
            metadata = { skipped: true, reason: scenesResult.reason };
          } else {
            metadata = { generated: scenesResult.generated, failed: scenesResult.failed };
          }
          break;
        }
        case 17: { // Color Grading (was 11)
          const gradeResult = await executeStep11(projectData, settings);
          result = gradeResult;
          metadata = { colorGrade: gradeResult.colorGrade, fileSizeMb: gradeResult.fileSizeMb };
          break;
        }
        case 18: { // Subtitles (was 12)
          const subResult = await executeStep12(projectData, settings);
          result = subResult;
          if (subResult.skipped) {
            metadata = { skipped: true, reason: subResult.reason };
          } else {
            metadata = { subtitlesCount: subResult.subtitlesCount, fileSizeMb: subResult.fileSizeMb };
          }
          break;
        }
        case 20: { // Sound Effects (hergebruikt stap 10 editing)
          const sfxResult = await executeStep10(projectData, settings);
          result = sfxResult;
          metadata = { duration: sfxResult.duration, fileSizeMb: sfxResult.fileSizeMb };
          break;
        }
        case 21: { // Video Effects (hergebruikt stap 10 editing)
          const vfxResult = await executeStep10(projectData, settings);
          result = vfxResult;
          metadata = { duration: vfxResult.duration, segments: vfxResult.segments, fileSizeMb: vfxResult.fileSizeMb };
          break;
        }
        case 22: { // Final Export (was 13)
          const exportResult = await executeStep13(projectData, settings);
          result = exportResult;
          metadata = { duration: exportResult.duration, fileSizeMb: exportResult.fileSizeMb, format: exportResult.format };
          break;
        }
        case 24: { // Drive Upload (was 14)
          const uploadResult = await executeStep14(projectData, settings);
          result = uploadResult;
          break;
        }
        default: {
          // Niet-ready stappen of niet-ingeschakelde stappen → skip
          await prisma.step.update({
            where: { projectId_stepNumber: { projectId: id, stepNumber } },
            data: { status: 'skipped', duration: 0 },
          });
          await prisma.logEntry.create({
            data: { level: 'info', step: stepNumber, source, message: `Stap ${stepNumber} overgeslagen (niet ready of niet ingeschakeld)`, projectId: id },
          });
          return;
        }
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

// ── Image Selection Routes ──

// Haal image opties op voor alle scenes
router.get('/:id/image-options', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project niet gevonden' });

    const fs = await import('fs/promises');
    const path = await import('path');
    const optionsPath = path.join('/root/.openclaw/workspace/projects', project.name, 'assets', 'image-options.json');

    try {
      const data = await fs.readFile(optionsPath, 'utf-8');
      res.json(JSON.parse(data));
    } catch {
      res.json({ scenes: [], total_scenes: 0, completed: 0, failed: 0 });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Kon image opties niet ophalen' });
  }
});

// Sla image selecties op (gebruiker kiest 1 image per scene + clip optie)
router.post('/:id/image-selections', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project niet gevonden' });

    const fs = await import('fs/promises');
    const path = await import('path');
    const selectionsPath = path.join('/root/.openclaw/workspace/projects', project.name, 'assets', 'image-selections.json');

    const selections = req.body.selections || [];
    await fs.mkdir(path.dirname(selectionsPath), { recursive: true });
    await fs.writeFile(selectionsPath, JSON.stringify({
      project: project.name,
      saved_at: new Date().toISOString(),
      total_selections: selections.length,
      selections,
    }, null, 2), 'utf-8');

    // Update ook het project record
    await prisma.project.update({
      where: { id: req.params.id },
      data: { selectedImages: JSON.stringify(selections) },
    });

    res.json({ success: true, saved: selections.length });
  } catch (error: any) {
    res.status(500).json({ error: 'Kon selecties niet opslaan: ' + error.message });
  }
});

// Haal opgeslagen selecties op
router.get('/:id/image-selections', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project niet gevonden' });

    const fs = await import('fs/promises');
    const path = await import('path');
    const selectionsPath = path.join('/root/.openclaw/workspace/projects', project.name, 'assets', 'image-selections.json');

    try {
      const data = await fs.readFile(selectionsPath, 'utf-8');
      res.json(JSON.parse(data));
    } catch {
      res.json({ selections: [], total_selections: 0 });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Kon selecties niet ophalen' });
  }
});

// Serve image bestanden vanuit de workspace (voor thumbnails in de UI)
router.get('/:id/image-file/*', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project niet gevonden' });

    const fs = await import('fs/promises');
    const path = await import('path');
    const relativePath = req.params[0]; // alles na /image-file/
    const fullPath = path.join('/root/.openclaw/workspace/projects', project.name, 'assets', 'image-options', relativePath);

    // Beveiligingscheck: pad mag niet buiten project dir gaan
    if (!fullPath.startsWith(path.join('/root/.openclaw/workspace/projects', project.name))) {
      return res.status(403).json({ error: 'Toegang geweigerd' });
    }

    try {
      await fs.access(fullPath);
      res.sendFile(fullPath);
    } catch {
      res.status(404).json({ error: 'Bestand niet gevonden' });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Kon bestand niet laden' });
  }
});

export default router;

// Lees project bestand (research.json, clips-research.json, style-profile.json, etc.)
router.get('/:id/file/:filepath(*)', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project niet gevonden' });

    const basePath = `/root/.openclaw/workspace/projects/${project.name}`;
    const filePath = `${basePath}/${req.params.filepath}`;

    // Security: voorkom directory traversal
    if (filePath.includes('..') || !filePath.startsWith(basePath)) {
      return res.status(403).json({ error: 'Geen toegang' });
    }

    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');

    // Probeer JSON te parsen
    try {
      const json = JSON.parse(content);
      res.json(json);
    } catch {
      res.type('text/plain').send(content);
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') return res.status(404).json({ error: 'Bestand niet gevonden' });
    res.status(500).json({ error: error.message });
  }
});
