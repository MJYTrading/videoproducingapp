import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { callLLM, LLM_MODELS } from '../services/llm.js';

const router = Router();

router.post('/:id/script-rewrite', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { paragraph, feedback, context, language } = req.body;
    if (!paragraph || !feedback) return res.status(400).json({ error: 'paragraph en feedback zijn verplicht' });

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return res.status(404).json({ error: 'Project niet gevonden' });

    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings?.elevateApiKey) return res.status(400).json({ error: 'Geen API key geconfigureerd' });

    const lang = language || project.language || 'EN';
    const result = await callLLM(
      { elevateApiKey: settings.elevateApiKey || undefined, anthropicApiKey: settings.anthropicApiKey || undefined },
      [
        { role: 'system', content: `You are a professional YouTube script editor. Rewrite paragraphs based on specific feedback while maintaining tone and flow.\n\nRules:\n- Keep the same general meaning and key information\n- Maintain approximate length unless asked to change it\n- Match the tone of surrounding context\n- Write in ${lang === 'NL' ? 'Dutch' : 'English'}\n- Return ONLY the rewritten paragraph, nothing else\n- No preamble, no explanation\n- Do NOT include [CLIP] markers` },
        { role: 'user', content: `ORIGINAL PARAGRAPH:\n"""\n${paragraph}\n"""\n\nFEEDBACK:\n${feedback}\n\n${context ? `CONTEXT:\n"""\n${context.slice(0,1000)}\n"""` : ''}\n\nRewrite based on the feedback. Return ONLY the rewritten text.` },
      ],
      { model: LLM_MODELS.SONNET, maxTokens: 2000, temperature: 0.6 }
    );

    const rewritten = result.content.trim();
    await prisma.logEntry.create({ data: { projectId: id, level: 'info', step: 7, source: 'Script Rewrite', message: `Alinea herschreven (${paragraph.split(/\s+/).length} -> ${rewritten.split(/\s+/).length} woorden)`, detail: JSON.stringify({ feedback }) } });
    res.json({ rewritten, provider: result.provider, model: result.model });
  } catch (error: any) {
    console.error('[ScriptRewrite] Error:', error.message);
    res.status(500).json({ error: error.message || 'Herschrijven mislukt' });
  }
});

export default router;
