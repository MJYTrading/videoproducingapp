/**
 * Sound Effects Service — Stap 21
 * 
 * Leest Director's Cut → matcht SFX cues met library (incl. audio analyse data)
 * → plaatst SFX op juiste tijdstippen via ffmpeg → output sfx-track.mp3
 * 
 * v2 — 28 feb 2026:
 * - Slimmere matching op basis van categorie, intensiteit en audio kenmerken
 * - Variatie: voorkom herhaling van hetzelfde SFX bestand
 * - Volume normalisatie op basis van loudness analyse
 * - Betere ffmpeg filter chain (geen cascading amix meer)
 * 
 * Output: {projectDir}/audio/sfx-track.mp3
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../db.js';

const WORKSPACE_BASE = '/root/.openclaw/workspace/projects';

interface SfxCue {
  type: string;       // Categorie: whoosh, impact, click, etc.
  at: number;         // Tijdstip in seconden
  sfxId?: string;     // Optioneel: specifiek SFX ID uit Director's Cut
  intensity?: string; // Optioneel: soft/medium/hard
  volume?: number;    // Optioneel: 0-1 schaal
}

interface MatchedCue {
  filePath: string;
  at: number;
  category: string;
  name: string;
  volume: number;     // 0-1
  duration: number;
}

export async function executeSoundEffects(project: any, settings: any): Promise<any> {
  const projPath = path.join(WORKSPACE_BASE, project.name);

  // ── 1. Lees Director's Cut ──
  let directorsCut: any;
  try {
    const dcText = await fs.readFile(path.join(projPath, 'edit', 'directors-cut.json'), 'utf-8');
    directorsCut = JSON.parse(dcText);
  } catch {
    console.log('[SFX] Geen directors-cut.json gevonden, maak stille track...');
    return createSilentTrack(projPath, directorsCut);
  }

  // ── 2. Verzamel alle SFX cues uit timeline ──
  const sfxCues: SfxCue[] = [];
  for (const segment of directorsCut.timeline || []) {
    if (segment.sfx && Array.isArray(segment.sfx)) {
      for (const sfx of segment.sfx) {
        sfxCues.push({
          type: sfx.type || sfx.category || 'whoosh',
          at: (segment.start || 0) + (sfx.at || 0),
          sfxId: sfx.sfx_id,
          intensity: sfx.intensity,
          volume: sfx.volume,
        });
      }
    }
  }

  if (sfxCues.length === 0) {
    console.log('[SFX] Geen SFX cues in Directors Cut, maak stille track...');
    return createSilentTrack(projPath, directorsCut);
  }

  console.log(`[SFX] ${sfxCues.length} SFX cues gevonden`);

  // ── 3. Haal beschikbare SFX uit library ──
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
    console.log('[SFX] Geen SFX beschikbaar in library, maak stille track...');
    return createSilentTrack(projPath, directorsCut);
  }

  // Parse tags voor alle SFX
  for (const sfx of availableSfx) {
    try {
      sfx._tags = JSON.parse(sfx.tags || '[]');
      sfx._usage = JSON.parse(sfx.usageGuide || '{}');
    } catch {
      sfx._tags = [];
      sfx._usage = {};
    }
  }

  // ── 4. Intelligente SFX matching ──
  const matchedCues: MatchedCue[] = [];
  const usedSfxIds = new Map<string, number>(); // Track usage voor variatie

  for (const cue of sfxCues) {
    const match = findBestSfx(cue, availableSfx, usedSfxIds);

    if (match) {
      // Bepaal volume op basis van cue + loudness analyse
      let volume = cue.volume ?? 0.7;
      const meanDb = match._usage?.mean_volume_db;
      if (meanDb != null) {
        // Normaliseer: heel luide SFX zachter, stille SFX harder
        if (meanDb > -10) volume *= 0.5;      // Heel luid → dempen
        else if (meanDb > -20) volume *= 0.7;  // Luid → beetje dempen
        else if (meanDb < -35) volume *= 1.3;  // Stil → versterken
      }
      volume = Math.min(1, Math.max(0.1, volume));

      matchedCues.push({
        filePath: match.filePath,
        at: cue.at,
        category: cue.type,
        name: match.name,
        volume: Math.round(volume * 100) / 100,
        duration: match.duration || 2,
      });

      // Track usage
      usedSfxIds.set(match.id, (usedSfxIds.get(match.id) || 0) + 1);
    }
  }

  if (matchedCues.length === 0) {
    console.log('[SFX] Geen SFX konden gematcht worden, maak stille track...');
    return createSilentTrack(projPath, directorsCut);
  }

  console.log(`[SFX] ${matchedCues.length}/${sfxCues.length} SFX gematcht`);

  // ── 5. Bepaal totale duur ──
  let totalDuration = directorsCut.total_duration || 300;
  try {
    const voiceoverPath = path.join(projPath, 'audio', 'voiceover.mp3');
    const probe = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${voiceoverPath}"`,
      { encoding: 'utf-8' }
    );
    totalDuration = Math.ceil(parseFloat(probe.trim()) || totalDuration);
  } catch {}

  // ── 6. Bouw SFX track met ffmpeg ──
  const audioDir = path.join(projPath, 'audio');
  await fs.mkdir(audioDir, { recursive: true });
  const outputPath = path.join(audioDir, 'sfx-track.mp3');

  // Valideer dat alle SFX bestanden bestaan
  const validCues: MatchedCue[] = [];
  for (const cue of matchedCues) {
    try {
      await fs.access(cue.filePath);
      validCues.push(cue);
    } catch {
      console.log(`[SFX] Bestand niet gevonden: ${cue.filePath}, skip...`);
    }
  }

  if (validCues.length === 0) {
    return createSilentTrack(projPath, directorsCut);
  }

  // Gebruik amerge + adelay aanpak (robuuster dan cascading amix)
  try {
    const silentPath = path.join(audioDir, 'sfx-silent.wav');
    execSync(
      `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${totalDuration} "${silentPath}"`,
      { stdio: 'pipe', timeout: 30_000 }
    );

    // Bouw filter: alle SFX als losse inputs met adelay + volume, dan amix alles in 1x
    let inputArgs = `-i "${silentPath}"`;
    const delayParts: string[] = [];

    for (let i = 0; i < validCues.length; i++) {
      const cue = validCues[i];
      inputArgs += ` -i "${cue.filePath}"`;
      const delayMs = Math.max(0, Math.round(cue.at * 1000));
      delayParts.push(
        `[${i + 1}:a]adelay=${delayMs}|${delayMs},volume=${cue.volume}[s${i}]`
      );
    }

    // Mix alles samen in één amix call
    const mixInputs = ['[0:a]', ...validCues.map((_, i) => `[s${i}]`)].join('');
    const filterComplex = [
      ...delayParts,
      `${mixInputs}amix=inputs=${validCues.length + 1}:duration=first:dropout_transition=0[out]`
    ].join('; ');

    execSync(
      `ffmpeg -y ${inputArgs} -filter_complex "${filterComplex}" -map "[out]" -c:a libmp3lame -q:a 2 "${outputPath}"`,
      { stdio: 'pipe', timeout: 180_000 }
    );

    // Cleanup
    try { await fs.unlink(silentPath); } catch {}

    console.log(`[SFX] ✅ SFX track opgeslagen: ${validCues.length} effecten → ${outputPath}`);

  } catch (error: any) {
    console.log(`[SFX] ⚠ ffmpeg complex filter mislukt: ${error.message?.slice(0, 150)}`);

    // Fallback: simpelere aanpak — max 10 SFX via sequentiële amix
    try {
      await buildSfxTrackSimple(validCues.slice(0, 10), totalDuration, outputPath, audioDir);
      console.log(`[SFX] Fallback: ${Math.min(validCues.length, 10)} SFX geplaatst (simpele methode)`);
    } catch (e2: any) {
      console.log(`[SFX] Fallback ook mislukt, maak stille track: ${e2.message?.slice(0, 100)}`);
      return createSilentTrack(projPath, directorsCut);
    }
  }

  return {
    skipped: false,
    sfxPlaced: validCues.length,
    totalCues: sfxCues.length,
    outputFile: 'audio/sfx-track.mp3',
    cues: validCues.map(c => ({ name: c.name, at: c.at, category: c.category, volume: c.volume })),
  };
}

// ══════════════════════════════════════════════════
// SFX MATCHING LOGICA
// ══════════════════════════════════════════════════

function findBestSfx(
  cue: SfxCue,
  available: any[],
  usedIds: Map<string, number>
): any | null {
  // 1. Specifiek ID gevraagd
  if (cue.sfxId) {
    const exact = available.find(s => s.id === cue.sfxId);
    if (exact) return exact;
  }

  // 2. Score alle kandidaten
  const scored = available.map(sfx => {
    let score = 0;

    // Categorie match (zwaarste weging)
    if (sfx.category === cue.type) score += 10;

    // Tag match
    if (sfx._tags?.includes(cue.type)) score += 5;

    // Naam match
    if (sfx.name.toLowerCase().includes(cue.type.toLowerCase())) score += 3;

    // Intensiteit match
    if (cue.intensity && sfx.intensity === cue.intensity) score += 4;

    // Variatie bonus: minder gebruikt = hogere score
    const usageCount = usedIds.get(sfx.id) || 0;
    score -= usageCount * 3;

    // Korte SFX voor korte cues
    if (sfx.duration < 2) score += 1;

    return { sfx, score };
  });

  // Sorteer op score (hoogste eerst)
  scored.sort((a, b) => b.score - a.score);

  // Neem de beste match als die minimaal score 3 heeft
  if (scored[0]?.score >= 3) {
    return scored[0].sfx;
  }

  // 3. Fuzzy fallback: zoek op subcategorie of verwante tags
  const typeAliases: Record<string, string[]> = {
    transition: ['whoosh', 'swoosh', 'swipe'],
    hit: ['impact', 'boom', 'slam'],
    beep: ['notification', 'ding', 'click'],
    swoosh: ['whoosh', 'swish', 'transition'],
    suspense: ['ambient', 'riser', 'tension'],
  };

  const aliases = typeAliases[cue.type] || [];
  for (const alias of aliases) {
    const match = scored.find(s => s.sfx.category === alias && s.score > 0);
    if (match) return match.sfx;
  }

  // 4. Laatste fallback: random uit dezelfde intensiteit
  const sameIntensity = available.filter(s =>
    s.intensity === (cue.intensity || 'medium')
  );
  if (sameIntensity.length > 0) {
    const idx = Math.floor(Math.random() * sameIntensity.length);
    return sameIntensity[idx];
  }

  // 5. Echt laatste resort: random
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }

  return null;
}

// ══════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════

async function createSilentTrack(projPath: string, directorsCut?: any): Promise<any> {
  const audioDir = path.join(projPath, 'audio');
  await fs.mkdir(audioDir, { recursive: true });
  const outputPath = path.join(audioDir, 'sfx-track.mp3');

  let totalDuration = directorsCut?.total_duration || 300;
  try {
    const voiceoverPath = path.join(projPath, 'audio', 'voiceover.mp3');
    const probe = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${voiceoverPath}"`,
      { encoding: 'utf-8' }
    );
    totalDuration = Math.ceil(parseFloat(probe.trim()) || totalDuration);
  } catch {}

  execSync(
    `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${totalDuration} -c:a libmp3lame -q:a 2 "${outputPath}"`,
    { stdio: 'pipe', timeout: 30_000 }
  );

  return { skipped: true, reason: 'Stille SFX track aangemaakt', outputFile: 'audio/sfx-track.mp3' };
}

/**
 * Simpelere SFX plaatsing: 1 voor 1 overlay (max ~10 SFX)
 * Wordt gebruikt als de complexe filter chain faalt
 */
async function buildSfxTrackSimple(
  cues: MatchedCue[],
  totalDuration: number,
  outputPath: string,
  audioDir: string,
): Promise<void> {
  // Start met stille track
  let currentPath = path.join(audioDir, 'sfx-build-0.mp3');
  execSync(
    `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${totalDuration} -c:a libmp3lame -q:a 2 "${currentPath}"`,
    { stdio: 'pipe', timeout: 30_000 }
  );

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const nextPath = i === cues.length - 1
      ? outputPath
      : path.join(audioDir, `sfx-build-${i + 1}.mp3`);
    const delayMs = Math.max(0, Math.round(cue.at * 1000));

    execSync(
      `ffmpeg -y -i "${currentPath}" -i "${cue.filePath}" ` +
      `-filter_complex "[1:a]adelay=${delayMs}|${delayMs},volume=${cue.volume}[sfx];[0:a][sfx]amix=inputs=2:duration=first[out]" ` +
      `-map "[out]" -c:a libmp3lame -q:a 2 "${nextPath}"`,
      { stdio: 'pipe', timeout: 60_000 }
    );

    // Cleanup vorige temp file
    if (i > 0) {
      try { await fs.unlink(currentPath); } catch {}
    } else {
      try { await fs.unlink(currentPath); } catch {}
    }
    currentPath = nextPath;
  }
}
