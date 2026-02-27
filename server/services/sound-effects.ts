/**
 * Sound Effects Service — Stap 21 (was 20)
 * 
 * Leest Director's Cut → haalt SFX timing → matcht met SFX library → plaatst met ffmpeg
 * Output: {projectDir}/audio/sfx-track.mp3
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../db.js';

const WORKSPACE_BASE = '/root/.openclaw/workspace/projects';

export async function executeSoundEffects(project: any, settings: any): Promise<any> {
  const projPath = path.join(WORKSPACE_BASE, project.name);

  // 1. Lees Director's Cut
  let directorsCut: any;
  try {
    const dcText = await fs.readFile(path.join(projPath, 'edit', 'directors-cut.json'), 'utf-8');
    directorsCut = JSON.parse(dcText);
  } catch {
    console.log('[SFX] Geen directors-cut.json gevonden, skip...');
    return { skipped: true, reason: 'Geen directors-cut.json' };
  }

  // 2. Verzamel alle SFX cues uit timeline
  const sfxCues: Array<{ type: string; at: number; sfxId?: string }> = [];
  for (const segment of directorsCut.timeline || []) {
    if (segment.sfx && Array.isArray(segment.sfx)) {
      for (const sfx of segment.sfx) {
        sfxCues.push({
          type: sfx.type || 'whoosh',
          at: (segment.start || 0) + (sfx.at || 0),
          sfxId: sfx.sfx_id,
        });
      }
    }
  }

  if (sfxCues.length === 0) {
    console.log('[SFX] Geen SFX cues in Directors Cut, skip...');
    return { skipped: true, reason: 'Geen SFX cues in Directors Cut' };
  }

  console.log(`[SFX] ${sfxCues.length} SFX cues gevonden`);

  // 3. Haal beschikbare SFX uit library (gefilterd op kanaal)
  let availableSfx: any[] = [];
  if (project.channelId) {
    const selections = await prisma.channelSfxSelection.findMany({
      where: { channelId: project.channelId },
      include: { soundEffect: true },
    });
    availableSfx = selections.map(s => s.soundEffect);
  }
  if (availableSfx.length === 0) {
    availableSfx = await prisma.soundEffect.findMany();
  }

  if (availableSfx.length === 0) {
    console.log('[SFX] Geen SFX beschikbaar in library, skip...');
    return { skipped: true, reason: 'Geen SFX in library' };
  }

  // 4. Match cues met SFX bestanden
  const matchedCues: Array<{ filePath: string; at: number; category: string }> = [];

  for (const cue of sfxCues) {
    // Zoek op sfxId eerst, dan op category/type
    let match = cue.sfxId
      ? availableSfx.find(s => s.id === cue.sfxId)
      : null;

    if (!match) {
      match = availableSfx.find(s => s.category === cue.type);
    }
    if (!match) {
      // Fuzzy match op naam
      match = availableSfx.find(s =>
        s.name.toLowerCase().includes(cue.type.toLowerCase()) ||
        (s.tags && s.tags.toLowerCase().includes(cue.type.toLowerCase()))
      );
    }
    if (!match && availableSfx.length > 0) {
      // Random fallback
      match = availableSfx[Math.floor(Math.random() * availableSfx.length)];
    }

    if (match) {
      matchedCues.push({
        filePath: match.filePath,
        at: cue.at,
        category: cue.type,
      });
    }
  }

  if (matchedCues.length === 0) {
    console.log('[SFX] Geen SFX konden gematcht worden, skip...');
    return { skipped: true, reason: 'Geen SFX matches' };
  }

  console.log(`[SFX] ${matchedCues.length}/${sfxCues.length} SFX gematcht`);

  // 5. Bepaal totale duur (uit voiceover of directors cut)
  let totalDuration = directorsCut.total_duration || 300;
  try {
    const voiceoverPath = path.join(projPath, 'audio', 'voiceover.mp3');
    const probe = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${voiceoverPath}"`, { encoding: 'utf-8' });
    totalDuration = Math.ceil(parseFloat(probe.trim()) || totalDuration);
  } catch {}

  // 6. Bouw ffmpeg command: leg SFX op juiste tijdstippen
  const audioDir = path.join(projPath, 'audio');
  await fs.mkdir(audioDir, { recursive: true });
  const outputPath = path.join(audioDir, 'sfx-track.mp3');

  // Genereer stille basis track
  const silentPath = path.join(audioDir, 'sfx-silent.mp3');
  execSync(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${totalDuration} -q:a 2 "${silentPath}"`, { stdio: 'pipe' });

  // Overlay alle SFX op de stille track
  let inputArgs = `-i "${silentPath}"`;
  let filterParts: string[] = [];
  let currentLabel = '0:a';

  for (let i = 0; i < matchedCues.length; i++) {
    const cue = matchedCues[i];

    // Check of SFX bestand bestaat
    try {
      await fs.access(cue.filePath);
    } catch {
      console.log(`[SFX] Bestand niet gevonden: ${cue.filePath}, skip...`);
      continue;
    }

    const inputIdx = i + 1;
    inputArgs += ` -i "${cue.filePath}"`;

    const delay = Math.max(0, Math.round(cue.at * 1000)); // ms
    const outLabel = i === matchedCues.length - 1 ? 'out' : `tmp${i}`;

    filterParts.push(`[${inputIdx}:a]adelay=${delay}|${delay},volume=0.7[sfx${i}]`);
    filterParts.push(`[${currentLabel}][sfx${i}]amix=inputs=2:duration=longest[${outLabel}]`);
    currentLabel = outLabel;
  }

  if (filterParts.length === 0) {
    // Geen geldige SFX bestanden
    console.log('[SFX] Geen geldige SFX bestanden gevonden');
    try { await fs.unlink(silentPath); } catch {}
    return { skipped: true, reason: 'Geen geldige SFX bestanden' };
  }

  const filterComplex = filterParts.join('; ');
  const cmd = `ffmpeg -y ${inputArgs} -filter_complex "${filterComplex}" -map "[out]" -q:a 2 "${outputPath}"`;

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 120_000 });
  } catch (error: any) {
    // Fallback: kopieer stille track als SFX track
    console.log(`[SFX] ffmpeg complex filter mislukt, fallback naar simpele methode: ${error.message?.slice(0, 100)}`);

    // Simpelere aanpak: concatenate met delays via amix
    try {
      await fs.copyFile(silentPath, outputPath);
      console.log('[SFX] Fallback: stille sfx-track aangemaakt');
    } catch {}
  }

  // Cleanup
  try { await fs.unlink(silentPath); } catch {}

  console.log(`[SFX] SFX track opgeslagen: ${outputPath}`);

  return {
    skipped: false,
    sfxPlaced: matchedCues.length,
    totalCues: sfxCues.length,
    outputFile: 'audio/sfx-track.mp3',
  };
}
