import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// ─── GET /pipelines/:slug/nodes — haal pipeline nodes op voor een videoType ───
router.get('/:slug/nodes', async (req: Request, res: Response) => {
  try {
    const pipeline = await prisma.pipeline.findFirst({
      where: { slug: req.params.slug, isActive: true },
      include: {
        nodes: {
          where: { isActive: true },
          include: { stepDefinition: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!pipeline) {
      return res.status(404).json({ error: `Pipeline '${req.params.slug}' niet gevonden` });
    }

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
    console.error('GET /pipelines/:slug/nodes error:', error);
    res.status(500).json({ error: 'Kon pipeline nodes niet ophalen' });
  }
});

// ─── GET /pipelines — lijst alle pipelines ───
router.get('/', async (_req: Request, res: Response) => {
  try {
    const pipelines = await prisma.pipeline.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { nodes: true } },
      },
      orderBy: { id: 'asc' },
    });

    res.json(pipelines.map((p: any) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      nodeCount: p._count.nodes,
    })));
  } catch (error: any) {
    console.error('GET /pipelines error:', error);
    res.status(500).json({ error: 'Kon pipelines niet ophalen' });
  }
});

export default router;
