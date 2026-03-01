/**
 * Admin Routes — Pipeline Builder v3
 * 
 * Adds: StepDefinitions, Pipelines, PipelineNodes, PipelineConnections
 * Keeps: v2 legacy routes for LLM Models, API Tools, Assistant
 */

import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

// ═══════════════════════════════════════════════════════════
// STEP DEFINITIONS (catalogus van atomaire stappen)
// ═══════════════════════════════════════════════════════════

router.get('/step-definitions', async (_req, res) => {
  try {
    const defs = await prisma.stepDefinition.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      include: { llmModel: true },
    });
    // Parse JSON fields
    res.json(defs.map(d => ({
      ...d,
      inputSchema: JSON.parse(d.inputSchema || '[]'),
      outputSchema: JSON.parse(d.outputSchema || '[]'),
      defaultConfig: JSON.parse(d.defaultConfig || '{}'),
    })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/step-definitions/:id', async (req, res) => {
  try {
    const d = await prisma.stepDefinition.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { llmModel: true },
    });
    if (!d) return res.status(404).json({ error: 'Niet gevonden' });
    res.json({ ...d, inputSchema: JSON.parse(d.inputSchema || '[]'), outputSchema: JSON.parse(d.outputSchema || '[]'), defaultConfig: JSON.parse(d.defaultConfig || '{}') });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch('/step-definitions/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.inputSchema) data.inputSchema = JSON.stringify(data.inputSchema);
    if (data.outputSchema) data.outputSchema = JSON.stringify(data.outputSchema);
    if (data.defaultConfig) data.defaultConfig = JSON.stringify(data.defaultConfig);
    const d = await prisma.stepDefinition.update({ where: { id: parseInt(req.params.id) }, data });
    res.json(d);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/step-definitions', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.inputSchema) data.inputSchema = JSON.stringify(data.inputSchema);
    if (data.outputSchema) data.outputSchema = JSON.stringify(data.outputSchema);
    if (data.defaultConfig) data.defaultConfig = JSON.stringify(data.defaultConfig);
    const d = await prisma.stepDefinition.create({ data });
    res.status(201).json(d);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// PIPELINES (per video type)
// ═══════════════════════════════════════════════════════════

router.get('/pipelines', async (_req, res) => {
  try {
    const pipelines = await prisma.pipeline.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      include: {
        _count: { select: { nodes: true, connections: true } },
      },
    });
    res.json(pipelines);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/pipelines/:id', async (req, res) => {
  try {
    const p = await prisma.pipeline.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        nodes: {
          include: {
            stepDefinition: { include: { llmModel: true } },
            llmModelOverride: true,
            outgoingConnections: true,
            incomingConnections: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
        connections: true,
      },
    });
    if (!p) return res.status(404).json({ error: 'Pipeline niet gevonden' });

    // Parse JSON fields in nodes
    const nodes = p.nodes.map(n => ({
      ...n,
      configOverrides: JSON.parse(n.configOverrides || '{}'),
      stepDefinition: {
        ...n.stepDefinition,
        inputSchema: JSON.parse(n.stepDefinition.inputSchema || '[]'),
        outputSchema: JSON.parse(n.stepDefinition.outputSchema || '[]'),
        defaultConfig: JSON.parse(n.stepDefinition.defaultConfig || '{}'),
      },
    }));

    res.json({ ...p, nodes });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/pipelines', async (req, res) => {
  try {
    const p = await prisma.pipeline.create({ data: req.body });
    res.status(201).json(p);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch('/pipelines/:id', async (req, res) => {
  try {
    const p = await prisma.pipeline.update({ where: { id: parseInt(req.params.id) }, data: req.body });
    res.json(p);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/pipelines/:id', async (req, res) => {
  try {
    await prisma.pipeline.update({ where: { id: parseInt(req.params.id) }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Dupliceer pipeline
router.post('/pipelines/:id/duplicate', async (req, res) => {
  try {
    const source = await prisma.pipeline.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { nodes: true, connections: true },
    });
    if (!source) return res.status(404).json({ error: 'Niet gevonden' });

    const newSlug = req.body.slug || `${source.slug}_copy`;
    const newName = req.body.name || `${source.name} (kopie)`;

    const newPipeline = await prisma.pipeline.create({
      data: { name: newName, slug: newSlug, description: source.description },
    });

    // Kopieer nodes
    const nodeIdMap: Record<number, number> = {};
    for (const node of source.nodes) {
      const newNode = await prisma.pipelineNode.create({
        data: {
          pipelineId: newPipeline.id,
          stepDefinitionId: node.stepDefinitionId,
          positionX: node.positionX,
          positionY: node.positionY,
          sortOrder: node.sortOrder,
          configOverrides: node.configOverrides,
          systemPromptOverride: node.systemPromptOverride,
          userPromptOverride: node.userPromptOverride,
          llmModelOverrideId: node.llmModelOverrideId,
          isCheckpoint: node.isCheckpoint,
          timeout: node.timeout,
          maxRetries: node.maxRetries,
          retryDelays: node.retryDelays,
        },
      });
      nodeIdMap[node.id] = newNode.id;
    }

    // Kopieer connections
    for (const conn of source.connections) {
      const newSourceId = nodeIdMap[conn.sourceNodeId];
      const newTargetId = nodeIdMap[conn.targetNodeId];
      if (!newSourceId || !newTargetId) continue;
      await prisma.pipelineConnection.create({
        data: {
          pipelineId: newPipeline.id,
          sourceNodeId: newSourceId,
          sourceOutputKey: conn.sourceOutputKey,
          targetNodeId: newTargetId,
          targetInputKey: conn.targetInputKey,
        },
      });
    }

    res.status(201).json(newPipeline);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// PIPELINE NODES
// ═══════════════════════════════════════════════════════════

router.post('/pipelines/:pipelineId/nodes', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.pipelineId);
    const node = await prisma.pipelineNode.create({
      data: { pipelineId, ...req.body, configOverrides: JSON.stringify(req.body.configOverrides || {}) },
      include: { stepDefinition: true },
    });
    res.status(201).json(node);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch('/pipelines/:pipelineId/nodes/:nodeId', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.configOverrides) data.configOverrides = JSON.stringify(data.configOverrides);
    const node = await prisma.pipelineNode.update({
      where: { id: parseInt(req.params.nodeId) },
      data,
      include: { stepDefinition: true },
    });
    res.json(node);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/pipelines/:pipelineId/nodes/:nodeId', async (req, res) => {
  try {
    await prisma.pipelineNode.delete({ where: { id: parseInt(req.params.nodeId) } });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Bulk update node posities (na drag & drop)
router.post('/pipelines/:pipelineId/nodes/positions', async (req, res) => {
  try {
    const positions: { id: number; x: number; y: number }[] = req.body.positions;
    for (const p of positions) {
      await prisma.pipelineNode.update({ where: { id: p.id }, data: { positionX: p.x, positionY: p.y } });
    }
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// PIPELINE CONNECTIONS
// ═══════════════════════════════════════════════════════════

router.post('/pipelines/:pipelineId/connections', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.pipelineId);
    const conn = await prisma.pipelineConnection.create({
      data: { pipelineId, ...req.body },
    });
    res.status(201).json(conn);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/pipelines/:pipelineId/connections/:connId', async (req, res) => {
  try {
    await prisma.pipelineConnection.delete({ where: { id: parseInt(req.params.connId) } });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// PIPELINE VALIDATIE
// ═══════════════════════════════════════════════════════════

router.get('/pipelines/:id/validate', async (req, res) => {
  try {
    const pipeline = await prisma.pipeline.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        nodes: { include: { stepDefinition: true, incomingConnections: true, outgoingConnections: true } },
        connections: true,
      },
    });
    if (!pipeline) return res.status(404).json({ error: 'Niet gevonden' });

    const errors: { nodeId: number; nodeName: string; type: string; message: string }[] = [];
    const warnings: { nodeId: number; nodeName: string; type: string; message: string }[] = [];

    for (const node of pipeline.nodes) {
      if (!node.isActive) continue;
      const def = node.stepDefinition;
      const inputs = JSON.parse(def.inputSchema || '[]');
      const connectedInputKeys = node.incomingConnections.map(c => c.targetInputKey);

      // Check: verplichte inputs verbonden?
      for (const input of inputs) {
        if (input.required && input.source !== 'project' && !connectedInputKeys.includes(input.key)) {
          errors.push({
            nodeId: node.id, nodeName: def.name, type: 'missing_input',
            message: `Verplichte input "${input.label}" (${input.key}) is niet verbonden`,
          });
        }
      }

      // Check: is de executor gebouwd?
      if (!def.isReady) {
        warnings.push({
          nodeId: node.id, nodeName: def.name, type: 'skeleton',
          message: `Stap is skeleton — executor "${def.executorFn}" is nog niet gebouwd`,
        });
      }

      // Check: LLM model ingesteld als stap het nodig heeft?
      if (def.llmModelId && !node.llmModelOverrideId) {
        // Gebruikt default — OK
      }

      // Check: geen uitgaande verbindingen (dead end, tenzij het een output stap is)
      if (node.outgoingConnections.length === 0 && def.category !== 'output') {
        warnings.push({
          nodeId: node.id, nodeName: def.name, type: 'no_outputs_connected',
          message: `Stap heeft geen uitgaande verbindingen — output wordt niet gebruikt`,
        });
      }
    }

    // Check: circulaire dependencies
    const nodeIds = pipeline.nodes.map(n => n.id);
    const adjList: Record<number, number[]> = {};
    for (const id of nodeIds) adjList[id] = [];
    for (const conn of pipeline.connections) {
      if (adjList[conn.sourceNodeId]) adjList[conn.sourceNodeId].push(conn.targetNodeId);
    }

    const visited = new Set<number>();
    const stack = new Set<number>();
    let hasCycle = false;

    function dfs(nodeId: number) {
      visited.add(nodeId);
      stack.add(nodeId);
      for (const neighbor of (adjList[nodeId] || [])) {
        if (stack.has(neighbor)) { hasCycle = true; return; }
        if (!visited.has(neighbor)) dfs(neighbor);
      }
      stack.delete(nodeId);
    }

    for (const id of nodeIds) {
      if (!visited.has(id)) dfs(id);
    }

    if (hasCycle) {
      errors.push({ nodeId: 0, nodeName: 'Pipeline', type: 'circular_dependency', message: 'Circulaire dependency gedetecteerd!' });
    }

    res.json({ valid: errors.length === 0, errors, warnings });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// V2 LEGACY: Pipeline Steps, Video Types, LLM Models, API Tools, Assistant
// (ongewijzigd van admin.ts v2.1)
// ═══════════════════════════════════════════════════════════

// --- Pipeline Steps (v2 legacy) ---
router.get('/pipeline-steps', async (_req, res) => {
  try { res.json(await prisma.pipelineStep.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, include: { llmModel: true, videoTypeConfigs: true } })); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch('/pipeline-steps/:id', async (req, res) => {
  try {
    const data = req.body;
    if (data.dependsOn && Array.isArray(data.dependsOn)) data.dependsOn = JSON.stringify(data.dependsOn);
    if (data.retryDelays && Array.isArray(data.retryDelays)) data.retryDelays = JSON.stringify(data.retryDelays);
    res.json(await prisma.pipelineStep.update({ where: { id: parseInt(req.params.id) }, data, include: { llmModel: true } }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- Video Types (v2 legacy) ---
router.get('/video-types/matrix', async (_req, res) => {
  try {
    const configs = await prisma.pipelineVideoTypeConfig.findMany({ include: { step: { select: { stepNumber: true, name: true } } } });
    const matrix: Record<string, Record<number, boolean>> = {};
    for (const c of configs) { if (!matrix[c.videoType]) matrix[c.videoType] = {}; matrix[c.videoType][c.step.stepNumber] = c.enabled; }
    res.json(matrix);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/video-types/list', async (_req, res) => {
  try { res.json((await prisma.pipelineVideoTypeConfig.findMany({ select: { videoType: true }, distinct: ['videoType'] })).map(c => c.videoType)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/video-types/:videoType/toggle', async (req, res) => {
  try {
    const { videoType } = req.params; const { stepNumber, enabled } = req.body;
    const step = await prisma.pipelineStep.findUnique({ where: { stepNumber } });
    if (!step) return res.status(404).json({ error: 'Stap niet gevonden' });
    await prisma.pipelineVideoTypeConfig.upsert({ where: { videoType_stepId: { videoType, stepId: step.id } }, update: { enabled }, create: { videoType, stepId: step.id, enabled } });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/video-types/add', async (req, res) => {
  try {
    const { name, copyFrom } = req.body;
    if (!name) return res.status(400).json({ error: 'Naam verplicht' });
    const existing = await prisma.pipelineVideoTypeConfig.findFirst({ where: { videoType: name } });
    if (existing) return res.status(400).json({ error: 'Bestaat al' });
    const steps = await prisma.pipelineStep.findMany({ where: { isActive: true } });
    let sourceMatrix: Record<number, boolean> = {};
    if (copyFrom) {
      const src = await prisma.pipelineVideoTypeConfig.findMany({ where: { videoType: copyFrom }, include: { step: { select: { stepNumber: true } } } });
      for (const c of src) sourceMatrix[c.step.stepNumber] = c.enabled;
    }
    for (const step of steps) await prisma.pipelineVideoTypeConfig.create({ data: { videoType: name, stepId: step.id, enabled: sourceMatrix[step.stepNumber] ?? false } });
    res.status(201).json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/video-types/:videoType', async (req, res) => {
  try { await prisma.pipelineVideoTypeConfig.deleteMany({ where: { videoType: req.params.videoType } }); res.json({ success: true }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- LLM Modellen ---
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

router.post('/llm-models/:id/test', async (req, res) => {
  try {
    const model = await prisma.llmModel.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!model) return res.status(404).json({ error: 'Niet gevonden' });
    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    const prompt = req.body.prompt || 'Zeg "Hallo, ik werk!" in maximaal 10 woorden.';
    const st = Date.now();
    let result: any;
    if (model.provider === 'Perplexity') {
      const key = settings?.perplexityApiKey; if (!key) return res.status(400).json({ error: 'Key niet ingesteld' });
      result = await (await fetch('https://api.perplexity.ai/chat/completions', { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model.modelString, messages: [{ role: 'user', content: prompt }] }) })).json();
    } else {
      const key = settings?.elevateApiKey; if (!key) return res.status(400).json({ error: 'Key niet ingesteld' });
      result = await (await fetch(`${model.baseUrl}/chat/completions`, { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model.modelString, messages: [{ role: 'user', content: prompt }], max_tokens: 100 }) })).json();
    }
    res.json({ success: true, content: result.choices?.[0]?.message?.content || 'Geen response', durationMs: Date.now() - st, usage: result.usage });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- API Tools ---
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
  try { await prisma.apiTool.delete({ where: { id: parseInt(req.params.id) } }); res.json({ success: true }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api-tools/health-all', async (_req, res) => {
  try {
    const tools = await prisma.apiTool.findMany({ where: { isActive: true, healthEndpoint: { not: null } } });
    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    const results: any[] = [];
    for (const tool of tools) {
      try {
        const headers: Record<string, string> = {};
        if (tool.authType === 'bearer' && tool.authKeyRef && settings) { const k = (settings as any)[tool.authKeyRef]; if (k) headers['Authorization'] = `Bearer ${k}`; }
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
    await prisma.apiTestLog.create({ data: { method: method || 'GET', url, headers: JSON.stringify(headers || {}), body: typeof body === 'string' ? body : JSON.stringify(body), statusCode: r.status, response: text.slice(0, 5000), durationMs: ms } });
    res.json({ statusCode: r.status, durationMs: ms, response: text.slice(0, 10000) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- AI Assistent ---
router.post('/assistant/chat', async (req, res) => {
  try {
    const { conversationId, message, model } = req.body;
    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings?.elevateApiKey) return res.status(400).json({ error: 'Elevate API key niet ingesteld' });
    const [stepDefs, pipelines, activeProjects, recentLogs, apiTools] = await Promise.all([
      prisma.stepDefinition.findMany({ where: { isActive: true }, select: { name: true, slug: true, isReady: true, executorLabel: true, category: true } }),
      prisma.pipeline.findMany({ where: { isActive: true }, include: { _count: { select: { nodes: true, connections: true } } } }),
      prisma.project.findMany({ where: { status: { in: ['running', 'paused', 'review'] } }, select: { id: true, name: true, title: true, status: true, videoType: true }, take: 10 }),
      prisma.logEntry.findMany({ orderBy: { timestamp: 'desc' }, take: 30, select: { level: true, step: true, message: true, timestamp: true } }),
      prisma.apiTool.findMany({ select: { name: true, lastHealthOk: true, lastHealthMs: true } }),
    ]);

    const contextStr = `STEP DEFINITIONS (v3 — ${stepDefs.length} atomaire stappen):\n${stepDefs.map(s => `${s.name} (${s.slug}) [${s.category}] — ${s.isReady ? '✅' : '❌'} ${s.executorLabel}`).join('\n')}\n\nPIPELINES:\n${pipelines.map(p => `${p.name} (${p.slug}): ${p._count.nodes} nodes, ${p._count.connections} connections`).join('\n')}\n\nACTIEVE PROJECTEN:\n${activeProjects.length === 0 ? 'Geen' : activeProjects.map(p => `${p.name}: ${p.status} (${p.videoType})`).join('\n')}\n\nRECENTE LOGS:\n${recentLogs.map(l => `[${l.level}] Stap ${l.step}: ${l.message}`).join('\n')}\n\nAPI TOOLS:\n${apiTools.map(t => `${t.name}: ${t.lastHealthOk === true ? `✅ ${t.lastHealthMs}ms` : t.lastHealthOk === false ? '❌' : '⚪'}`).join('\n')}`;

    const systemPrompt = `Je bent een AI assistent in de Video Producer App. Je hebt toegang tot:\n- ${stepDefs.length} step definitions (atomaire stappen)\n- ${pipelines.length} pipelines (1 per video type)\n- Project data, logs, en API tool status\n\nJe taken: diagnosticeren, adviseren, prompts verbeteren, dependencies uitleggen.\nJe hebt GEEN schrijftoegang. Verwijs naar admin scherm.\nAntwoord in het Nederlands.\n\n${contextStr}`;

    let conv: any;
    if (conversationId) conv = await prisma.assistantConversation.findUnique({ where: { id: conversationId } });
    if (!conv) conv = await prisma.assistantConversation.create({ data: { title: message.slice(0, 50), messages: '[]' } });
    const history = JSON.parse(conv.messages || '[]');
    history.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    const messages = [{ role: 'system', content: systemPrompt }, ...history.slice(-20).map((m: any) => ({ role: m.role, content: m.content }))];
    const llmR = await fetch('https://chat-api.elevate.uno/v1/chat/completions', { method: 'POST', headers: { 'Authorization': `Bearer ${settings.elevateApiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model || 'claude-sonnet-4.5', messages, max_tokens: 4096, temperature: 0.7 }) });
    const llmData = await llmR.json();
    const assistantMsg = llmData.choices?.[0]?.message?.content || 'Geen response.';
    history.push({ role: 'assistant', content: assistantMsg, timestamp: new Date().toISOString() });
    await prisma.assistantConversation.update({ where: { id: conv.id }, data: { messages: JSON.stringify(history), context: contextStr.slice(0, 5000) } });
    res.json({ conversationId: conv.id, message: assistantMsg });
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
