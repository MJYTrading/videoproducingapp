/**
 * Video Effects / Special Edits Service — Stap 22 (was 21)
 * 
 * Leest Director's Cut → voert special edits uit via Python scripts → output fragmenten
 * Output: {projectDir}/edit/effects/ — per effect een video fragment
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../db.js';

const WORKSPACE_BASE = '/root/.openclaw/workspace/projects';
const EFFECTS_DIR = '/root/video-producer/effects';

export async function executeVideoEffects(project: any, settings: any): Promise<any> {
  const projPath = path.join(WORKSPACE_BASE, project.name);
  const effectsOutputDir = path.join(projPath, 'edit', 'effects');
  await fs.mkdir(effectsOutputDir, { recursive: true });

  // 1. Lees Director's Cut
  let directorsCut: any;
  try {
    const dcText = await fs.readFile(path.join(projPath, 'edit', 'directors-cut.json'), 'utf-8');
    directorsCut = JSON.parse(dcText);
  } catch {
    console.log('[VideoFX] Geen directors-cut.json gevonden, skip...');
    return { skipped: true, reason: 'Geen directors-cut.json' };
  }

  // 2. Verzamel special_edits uit Directors Cut
  const specialEdits = directorsCut.special_edits || [];

  if (specialEdits.length === 0) {
    console.log('[VideoFX] Geen special edits in Directors Cut, skip...');
    return { skipped: true, reason: 'Geen special edits' };
  }

  console.log(`[VideoFX] ${specialEdits.length} special edits gevonden`);

  // 3. Zorg dat effects directory bestaat
  try {
    await fs.mkdir(EFFECTS_DIR, { recursive: true });
  } catch {}

  // 4. Per special edit: zoek script en voer uit
  const results: Array<{ editId: string; name: string; success: boolean; outputPath?: string; error?: string }> = [];

  for (const edit of specialEdits) {
    const editInfo = edit.edit_id
      ? await prisma.specialEdit.findUnique({ where: { id: edit.edit_id } })
      : null;

    const editName = edit.edit_name || editInfo?.name || 'unknown';
    const scriptName = editInfo?.ffmpegTemplate || toScriptName(editName);
    const scriptPath = path.join(EFFECTS_DIR, scriptName);
    const outputPath = path.join(effectsOutputDir, `effect-${edit.at_timeline_id || results.length + 1}.mp4`);

    console.log(`[VideoFX] Uitvoeren: ${editName} (script: ${scriptName})`);

    // Parameters samenstellen
    const params = {
      ...(edit.parameters || {}),
      project_dir: projPath,
      resolution: project.output === 'youtube_short' ? '1080x1920' : '1920x1080',
      fps: 30,
    };

    try {
      // Check of Python script bestaat
      try {
        await fs.access(scriptPath);
      } catch {
        // Script bestaat niet — maak een fallback
        console.log(`[VideoFX] Script ${scriptPath} niet gevonden, genereer fallback...`);
        await generateFallbackEffect(params, outputPath, editName);
        results.push({ editId: edit.edit_id || '', name: editName, success: true, outputPath });
        continue;
      }

      // Voer Python script uit
      const paramsJson = JSON.stringify(params).replace(/'/g, "\\'");
      const cmd = `python3 "${scriptPath}" '${paramsJson}' '${outputPath}'`;

      execSync(cmd, {
        stdio: 'pipe',
        timeout: 120_000,
        env: { ...process.env, PYTHONPATH: EFFECTS_DIR },
      });

      // Check of output aangemaakt is
      try {
        await fs.access(outputPath);
        results.push({ editId: edit.edit_id || '', name: editName, success: true, outputPath });
        console.log(`[VideoFX] ${editName} succesvol: ${outputPath}`);
      } catch {
        results.push({ editId: edit.edit_id || '', name: editName, success: false, error: 'Output niet aangemaakt' });
      }
    } catch (error: any) {
      console.error(`[VideoFX] ${editName} mislukt: ${error.message?.slice(0, 200)}`);
      results.push({ editId: edit.edit_id || '', name: editName, success: false, error: error.message?.slice(0, 200) });
    }
  }

  const successful = results.filter(r => r.success).length;
  console.log(`[VideoFX] ${successful}/${results.length} effects succesvol`);

  // Sla effect-map op
  await fs.writeFile(
    path.join(effectsOutputDir, 'effects-map.json'),
    JSON.stringify({ effects: results }, null, 2),
    'utf-8'
  );

  return {
    skipped: false,
    totalEffects: results.length,
    successful,
    failed: results.length - successful,
    results,
  };
}

/**
 * Genereer een fallback effect met ffmpeg (als Python script niet beschikbaar is)
 * Simpele text overlay als placeholder
 */
async function generateFallbackEffect(params: any, outputPath: string, editName: string): Promise<void> {
  const resolution = params.resolution || '1920x1080';
  const [width, height] = resolution.split('x').map(Number);
  const duration = params.duration || 3;
  const text = params.text || params.items?.[0] || editName;

  // Maak een simpel title card met ffmpeg
  const safeText = text.replace(/['"\\]/g, '');
  const cmd = `ffmpeg -y -f lavfi -i color=c=black:s=${width}x${height}:d=${duration}:r=30 ` +
    `-vf "drawtext=text='${safeText}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2" ` +
    `-c:v libx264 -pix_fmt yuv420p "${outputPath}"`;

  execSync(cmd, { stdio: 'pipe', timeout: 30_000 });
}

/**
 * Converteer edit naam naar script bestandsnaam
 * "Grid Overview Zoom" → "grid_overview_zoom.py"
 */
function toScriptName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '.py';
}
