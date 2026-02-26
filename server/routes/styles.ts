import { Router, Request, Response } from 'express';
import fs from 'fs/promises';

const router = Router();
const STYLES_PATH = '/root/.openclaw/workspace/video-producer/presets/styles.json';

async function readStyles(): Promise<any[]> {
  const raw = await fs.readFile(STYLES_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function writeStyles(styles: any[]): Promise<void> {
  await fs.writeFile(STYLES_PATH, JSON.stringify(styles, null, 2), 'utf-8');
}

// GET alle styles
router.get('/', async (_req: Request, res: Response) => {
  try {
    const styles = await readStyles();
    res.json(styles);
  } catch (error: any) {
    console.error('GET /styles error:', error);
    res.status(500).json({ error: 'Kon styles niet ophalen' });
  }
});

// GET enkele style by id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const styles = await readStyles();
    const style = styles.find((s: any) => s.id === req.params.id);
    if (!style) return res.status(404).json({ error: 'Style niet gevonden' });
    res.json(style);
  } catch (error: any) {
    res.status(500).json({ error: 'Kon style niet ophalen' });
  }
});

// POST nieuwe style
router.post('/', async (req: Request, res: Response) => {
  try {
    const styles = await readStyles();
    const data = req.body;
    if (!data.id || !data.name) {
      return res.status(400).json({ error: 'id en name zijn verplicht' });
    }
    if (styles.find((s: any) => s.id === data.id)) {
      return res.status(400).json({ error: 'Style met dit ID bestaat al' });
    }
    const newStyle = {
      name: data.name,
      id: data.id,
      allows_real_images: data.allows_real_images ?? false,
      style_prefix: data.style_prefix || '',
      style_suffix: data.style_suffix || '',
      character_description: data.character_description || '',
      color_grade: data.color_grade || 'clean_neutral',
      example_prompt: data.example_prompt || '',
    };
    styles.push(newStyle);
    await writeStyles(styles);
    res.status(201).json(newStyle);
  } catch (error: any) {
    res.status(500).json({ error: 'Kon style niet aanmaken' });
  }
});

// PUT style updaten
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const styles = await readStyles();
    const index = styles.findIndex((s: any) => s.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Style niet gevonden' });
    const data = req.body;
    styles[index] = {
      ...styles[index],
      name: data.name ?? styles[index].name,
      allows_real_images: data.allows_real_images ?? styles[index].allows_real_images,
      style_prefix: data.style_prefix ?? styles[index].style_prefix,
      style_suffix: data.style_suffix ?? styles[index].style_suffix,
      character_description: data.character_description ?? styles[index].character_description,
      color_grade: data.color_grade ?? styles[index].color_grade,
      example_prompt: data.example_prompt ?? styles[index].example_prompt,
    };
    await writeStyles(styles);
    res.json(styles[index]);
  } catch (error: any) {
    res.status(500).json({ error: 'Kon style niet updaten' });
  }
});

// DELETE style
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const styles = await readStyles();
    const index = styles.findIndex((s: any) => s.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Style niet gevonden' });
    styles.splice(index, 1);
    await writeStyles(styles);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Kon style niet verwijderen' });
  }
});

export default router;
