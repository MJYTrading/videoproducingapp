/**
 * Admin Routes — Pipeline Admin v2.1
 * 
 * Verbeteringen:
 * - Video types toevoegen/verwijderen
 * - Pipeline steps: tool dropdowns uit ApiTool tabel
 * - API Tools: CRUD met auto-add
 */

import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

// ═══════════════════════════════════════════════
// PIPELINE STAPPEN
// ═══════════════════════════════════════════════

router.get('/pipeline-steps', async (_req, res) => {
  try {
    const steps = await prisma.pipelineStep.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { llmModel: true, videoTypeConfigs: true },
    });
    res.json(steps);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/pipeline-steps/:id', async (req, res) => {
  try {
    const step = await prisma.pipelineStep.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { llmModel: true, videoTypeConfigs: true },
    });
    if (!step) return res.status(404).json({ error: 'Stap niet gevonden' });
    res.json(step);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch('/pipeline-steps/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;
    if (data.dependsOn && Array.isArray(data.dependsOn)) data.dependsOn = JSON.stringify(data.dependsOn);
    if (data.retryDelays && Array.isArray(data.retryDelays)) data.retryDelays = JSON.stringify(data.retryDelays);
    const step = await prisma.pipelineStep.update({ where: { id }, data, include: { llmModel: true } });
    res.json(step);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/pipeline-steps', async (req, res) => {
  try {
    const { insertAfter, ...data } = req.body;
    const insertPoint = insertAfter ?? 23;
    await prisma.pipelineStep.updateMany({
      where: { stepNumber: { gt: insertPoint } },
      data: { stepNumber: { increment: 1 }, sortOrder: { increment: 1 } },
    });
    const newStep = await prisma.pipelineStep.create({
      data: { ...data, stepNumber: insertPoint + 1, sortOrder: insertPoint + 1,
        dependsOn: JSON.stringify(data.dependsOn || [insertPoint]),
        retryDelays: JSON.stringify(data.retryDelays || [5000, 15000, 30000]) },
    });
    res.status(201).json(newStep);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/pipeline-steps/:id', async (req, res) => {
  try {
    await prisma.pipelineStep.update({ where: { id: parseInt(req.params.id) }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/pipeline-steps/reorder', async (req, res) => {
  try {
    const items: { id: number; sortOrder: number }[] = req.body.items;
    for (const item of items) {
      await prisma.pipelineStep.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } });
    }
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════
// VIDEO TYPE CONFIGS
// ═══════════════════════════════════════════════

router.get('/video-types/matrix', async (_req, res) => {
  try {
    const configs = await prisma.pipelineVideoTypeConfig.findMany({
      include: { step: { select: { stepNumber: true, name: true } } },
    });
    const matrix: Record<string, Record<number, boolean>> = {};
    for (const config of configs) {
      if (!matrix[config.videoType]) matrix[config.videoType] = {};
      matrix[config.videoType][config.step.stepNumber] = config.enabled;
    }
    res.json(matrix);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Alle bekende video types ophalen
router.get('/video-types/list', async (_req, res) => {
  try {
    const configs = await prisma.pipelineVideoTypeConfig.findMany({ select: { videoType: true }, distinct: ['videoType'] });
    res.json(configs.map(c => c.videoType));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/video-types/:videoType', async (req, res) => {
  try {
    const { videoType } = req.params;
    const steps: Record<number, boolean> = req.body.steps;
    for (const [stepNumStr, enabled] of Object.entries(steps)) {
      const step = await prisma.pipelineStep.findUnique({ where: { stepNumber: parseInt(stepNumStr) } });
      if (!step) continue;
      await prisma.pipelineVideoTypeConfig.upsert({
        where: { videoType_stepId: { videoType, stepId: step.id } },
        update: { enabled }, create: { videoType, stepId: step.id, enabled },
      });
    }
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/video-types/:videoType/toggle', async (req, res) => {
  try {
    const { videoType } = req.params;
    const { stepNumber, enabled } = req.body;
    const step = await prisma.pipelineStep.findUnique({ where: { stepNumber } });
    if (!step) return res.status(404).json({ error: 'Stap niet gevonden' });
    await prisma.pipelineVideoTypeConfig.upsert({
      where: { videoType_stepId: { videoType, stepId: step.id } },
      update: { enabled }, create: { videoType, stepId: step.id, enabled },
    });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Nieuw video type toevoegen (kopieert van een bestaand type of maakt alles disabled)
router.post('/video-types/add', async (req, res) => {
  try {
    const { name, copyFrom } = req.body;
    if (!name) return res.status(400).json({ error: 'Naam is verplicht' });

    const existing = await prisma.pipelineVideoTypeConfig.findFirst({ where: { videoType: name } });
    if (existing) return res.status(400).json({ error: `Video type "${name}" bestaat al` });

    const steps = await prisma.pipelineStep.findMany({ where: { isActive: true } });
    let sourceMatrix: Record<number, boolean> = {};

    if (copyFrom) {
      const sourceConfigs = await prisma.pipelineVideoTypeConfig.findMany({
        where: { videoType: copyFrom },
        include: { step: { select: { stepNumber: true } } },
      });
      for (const c of sourceConfigs) sourceMatrix[c.step.stepNumber] = c.enabled;
    }

    for (const step of steps) {
      await prisma.pipelineVideoTypeConfig.create({
        data: { videoType: name, stepId: step.id, enabled: sourceMatrix[step.stepNumber] ?? false },
      });
    }

    res.status(201).json({ success: true, videoType: name, stepsCreated: steps.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Video type verwijderen
router.delete('/video-types/:videoType', async (req, res) => {
  try {
    await prisma.pipelineVideoTypeConfig.deleteMany({ where: { videoType: req.params.videoType } });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════
// LLM MODELLEN
// ═══════════════════════════════════════════════

router.get('/llm-models', async (_req, res) => {
  try { res.json(await prisma.llmModel.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } })); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/llm-models', async (req, res) => {
  try { res.status(201).json(await prisma.llmModel.create({ data: req.body })); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch('/llm-models/:id', async (req, res) => {
  try { res.json(await prisma.llmModel.update({ where: { id: parseInt(req.params.id) }, data: req.body })); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/llm-models/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const linked = await prisma.pipelineStep.count({ where: { llmModelId: id } });
    if (linked > 0) return res.status(400).json({ error: `Gekoppeld aan ${linked} stap(pen)` });
    await prisma.llmModel.update({ where: { id }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/llm-models/:id/test', async (req, res) => {
  try {
    const model = await prisma.llmModel.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!model) return res.status(404).json({ error: 'Model niet gevonden' });
    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    const prompt = req.body.prompt || 'Zeg "Hallo, ik werk!" in maximaal 10 woorden.';
    const startTime = Date.now();
    let result: any;

    if (model.provider === 'Perplexity') {
      const apiKey = settings?.perplexityApiKey;
      if (!apiKey) return res.status(400).json({ error: 'Perplexity API key niet ingesteld' });
      const r = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model.modelString, messages: [{ role: 'user', content: prompt }] }),
      });
      result = await r.json();
    } else {
      const apiKey = settings?.elevateApiKey;
      if (!apiKey) return res.status(400).json({ error: 'Elevate API key niet ingesteld' });
      const r = await fetch(`${model.baseUrl}/chat/completions`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model.modelString, messages: [{ role: 'user', content: prompt }], max_tokens: 100 }),
      });
      result = await r.json();
    }

    const durationMs = Date.now() - startTime;
    res.json({ success: true, content: result.choices?.[0]?.message?.content || 'Geen response', durationMs, usage: result.usage });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════
// API TOOLS
// ═══════════════════════════════════════════════

router.get('/api-tools', async (_req, res) => {
  try { res.json(await prisma.apiTool.findMany({ orderBy: { id: 'asc' } })); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api-tools', async (req, res) => {
  try { res.status(201).json(await prisma.apiTool.create({ data: req.body })); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch('/api-tools/:id', async (req, res) => {
  try { res.json(await prisma.apiTool.update({ where: { id: parseInt(req.params.id) }, data: req.body })); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/api-tools/:id', async (req, res) => {
  try {
    await prisma.apiTool.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api-tools/:id/health', async (req, res) => {
  try {
    const tool = await prisma.apiTool.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!tool) return res.status(404).json({ error: 'Tool niet gevonden' });
    if (!tool.healthEndpoint) return res.status(400).json({ error: 'Geen health endpoint' });
    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    const headers: Record<string, string> = {};
    if (tool.authType === 'bearer' && tool.authKeyRef && settings) {
      const key = (settings as any)[tool.authKeyRef]; if (key) headers['Authorization'] = `Bearer ${key}`;
    } else if (tool.authType === 'api-key' && tool.authKeyRef && settings) {
      const key = (settings as any)[tool.authKeyRef]; if (key) headers['Authorization'] = key;
    }
    const st = Date.now();
    const r = await fetch(`${tool.baseUrl}${tool.healthEndpoint}`, { headers, signal: AbortSignal.timeout(10000) });
    const ms = Date.now() - st;
    await prisma.apiTool.update({ where: { id: tool.id }, data: { lastHealthCheck: new Date(), lastHealthOk: r.ok, lastHealthMs: ms } });
    res.json({ ok: r.ok, statusCode: r.status, durationMs: ms });
  } catch (err: any) {
    await prisma.apiTool.update({ where: { id: parseInt(req.params.id) }, data: { lastHealthCheck: new Date(), lastHealthOk: false } }).catch(() => {});
    res.json({ ok: false, error: err.message });
  }
});

router.post('/api-tools/health-all', async (_req, res) => {
  try {
    const tools = await prisma.apiTool.findMany({ where: { isActive: true, healthEndpoint: { not: null } } });
    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    const results: any[] = [];
    for (const tool of tools) {
      try {
        const headers: Record<string, string> = {};
        if (tool.authType === 'bearer' && tool.authKeyRef && settings) {
          const key = (settings as any)[tool.authKeyRef]; if (key) headers['Authorization'] = `Bearer ${key}`;
        }
        const st = Date.now();
        const r = await fetch(`${tool.baseUrl}${tool.healthEndpoint}`, { headers, signal: AbortSignal.timeout(10000) });
        const ms = Date.now() - st;
        await prisma.apiTool.update({ where: { id: tool.id }, data: { lastHealthCheck: new Date(), lastHealthOk: r.ok, lastHealthMs: ms } });
        results.push({ id: tool.id, name: tool.name, ok: r.ok, durationMs: ms });
      } catch (err: any) {
        await prisma.apiTool.update({ where: { id: tool.id }, data: { lastHealthCheck: new Date(), lastHealthOk: false } });
        results.push({ id: tool.id, name: tool.name, ok: false, error: err.message });
      }
    }
    res.json(results);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api-tools/test', async (req, res) => {
  try {
    const { method, url, headers, body } = req.body;
    const st = Date.now();
    const opts: RequestInit = { method: method || 'GET', signal: AbortSignal.timeout(30000) };
    if (headers) opts.headers = headers;
    if (body && method !== 'GET') opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    const r = await fetch(url, opts);
    const ms = Date.now() - st;
    const text = await r.text();
    await prisma.apiTestLog.create({
      data: { method: method || 'GET', url, headers: JSON.stringify(headers || {}),
        body: typeof body === 'string' ? body : JSON.stringify(body), statusCode: r.status, response: text.slice(0, 5000), durationMs: ms },
    });
    res.json({ statusCode: r.status, durationMs: ms, response: text.slice(0, 10000) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api-tools/test-logs', async (_req, res) => {
  try { res.json(await prisma.apiTestLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════
// AI ASSISTENT
// ═══════════════════════════════════════════════

router.post('/assistant/chat', async (req, res) => {
  try {
    const { conversationId, message, model } = req.body;
    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings?.elevateApiKey) return res.status(400).json({ error: 'Elevate API key niet ingesteld' });

    const [pipelineSteps, activeProjects, recentLogs, apiTools] = await Promise.all([
      prisma.pipelineStep.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { stepNumber: true, name: true, readyToUse: true, executorLabel: true } }),
      prisma.project.findMany({ where: { status: { in: ['running', 'paused', 'review'] } }, select: { id: true, name: true, title: true, status: true, videoType: true }, take: 10 }),
      prisma.logEntry.findMany({ orderBy: { timestamp: 'desc' }, take: 30, select: { level: true, step: true, message: true, timestamp: true } }),
      prisma.apiTool.findMany({ select: { name: true, lastHealthOk: true, lastHealthMs: true } }),
    ]);

    const contextStr = `PIPELINE STAPPEN (v2 — 24 stappen):\n${pipelineSteps.map(s => `${s.stepNumber}. ${s.name} (${s.executorLabel}) — ${s.readyToUse ? '✅ Ready' : '❌ Skeleton'}`).join('\n')}\n\nACTIEVE PROJECTEN:\n${activeProjects.length === 0 ? 'Geen' : activeProjects.map(p => `${p.name}: ${p.status} (${p.videoType})`).join('\n')}\n\nRECENTE LOGS:\n${recentLogs.map(l => `[${l.level}] Stap ${l.step}: ${l.message}`).join('\n')}\n\nAPI TOOLS:\n${apiTools.map(t => `${t.name}: ${t.lastHealthOk === true ? `✅ ${t.lastHealthMs}ms` : t.lastHealthOk === false ? '❌ Offline' : '⚪ Niet getest'}`).join('\n')}`;

    const systemPrompt = `Je bent een AI assistent geïntegreerd in de Video Producer App. Je hebt toegang tot de pipeline configuratie (v2 — 24 stappen), project data, en logs.\n\nJe taken:\n- Pipeline problemen diagnosticeren\n- Advies over configuratie en optimalisatie\n- Helpen met prompts schrijven/verbeteren\n- Uitleggen hoe stappen werken + dependencies\n- Status overzichten\n\nJe hebt GEEN schrijftoegang. Verwijs naar admin scherm voor wijzigingen.\nAntwoord in het Nederlands.\n\nCONTEXT:\n${contextStr}`;

    let conversation: any;
    if (conversationId) conversation = await prisma.assistantConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) conversation = await prisma.assistantConversation.create({ data: { title: message.slice(0, 50), messages: '[]' } });

    const history = JSON.parse(conversation.messages || '[]');
    history.push({ role: 'user', content: message, timestamp: new Date().toISOString() });

    const messages = [{ role: 'system', content: systemPrompt }, ...history.slice(-20).map((m: any) => ({ role: m.role, content: m.content }))];

    const llmR = await fetch('https://chat-api.elevate.uno/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${settings.elevateApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'claude-sonnet-4.5', messages, max_tokens: 4096, temperature: 0.7 }),
    });

    const llmData = await llmR.json();
    const assistantMessage = llmData.choices?.[0]?.message?.content || 'Geen response ontvangen.';
    history.push({ role: 'assistant', content: assistantMessage, timestamp: new Date().toISOString() });

    await prisma.assistantConversation.update({
      where: { id: conversation.id },
      data: { messages: JSON.stringify(history), context: contextStr.slice(0, 5000) },
    });

    res.json({ conversationId: conversation.id, message: assistantMessage });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/assistant/conversations', async (_req, res) => {
  try { res.json(await prisma.assistantConversation.findMany({ orderBy: { updatedAt: 'desc' }, take: 20, select: { id: true, title: true, updatedAt: true } })); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/assistant/conversations/:id', async (req, res) => {
  try {
    const c = await prisma.assistantConversation.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: 'Niet gevonden' });
    res.json({ ...c, messages: JSON.parse(c.messages || '[]') });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/assistant/conversations/:id', async (req, res) => {
  try { await prisma.assistantConversation.delete({ where: { id: req.params.id } }); res.json({ success: true }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
