/**
 * Background Music Service — Stap 17
 * 
 * Leest Director's Cut music segments → selecteert tracks uit library
 * → past volume ducking toe (zachter tijdens voiceover)
 * → loopt korte tracks → output background-music.mp3
 * 
 * v1 — 28 feb 2026
 * 
 * Music segments uit Director's Cut:
 * {
 *   "music": {
 *     "segments": [
 *       { "start": 0, "end": 60, "mood": "tense", "track_id": "...", "volume_db": -18,
 *         "fade_in": { "duration": 2.0 }, "fade_out": { "duration": 3.0 } }
 *     ]
 *   }
 * }
 * 
 * Output: {projectDir}/audio/background-music.mp3
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../db.js';

const WORKSPACE_BASE = '/root/.openclaw/workspace/projects';

interface MusicSegment {
  start: number;
  end: number;
  mood: string;
  trackId?: string;
  volumeDb: number;     // Target volume in dB (typically -18 to -24)
  fadeIn?: number;       // Fade-in duur in seconden
  fadeOut?: number;      // Fade-out duur in seconden
}

export async function executeBackgroundMusic(project: any, settings: any): Promise<any> {
  const projPath = path.join(WORKSPACE_BASE, project.name);

  // ── 1. Lees Director's Cut ──
  let directorsCut: any;
  try {
    const dcText = await fs.readFile(path.join(projPath, 'edit', 'directors-cut.json'), 'utf-8');
    directorsCut = JSON.parse(dcText);
  } catch {
    console.log('[Music] Geen directors-cut.json gevonden, skip...');
    return { skipped: true, reason: 'Geen directors-cut.json' };
  }

  // ── 2. Parse music segments ──
  const rawSegments = directorsCut.music?.segments || [];
  if (rawSegments.length === 0) {
    console.log('[Music] Geen music segments in Directors Cut, skip...');
    return { skipped: true, reason: 'Geen music segments' };
  }

  const segments: MusicSegment[] = rawSegments.map((s: any) => ({
    start: s.start || 0,
    end: s.end || 0,
    mood: s.mood || 'neutral',
    trackId: s.track_id,
    volumeDb: s.volume_db ?? -20,
    fadeIn: s.fade_in?.duration || 2,
    fadeOut: s.fade_out?.duration || 3,
  }));

  console.log(`[Music] ${segments.length} music segments gevonden`);

  // ── 3. Haal beschikbare tracks uit library ──
  let availableTracks: any[] = [];
  if (project.channelId) {
    const selections = await prisma.channelMusicSelection.findMany({
      where: { channelId: project.channelId },
      include: { musicTrack: true },
    });
    availableTracks = selections.map(s => s.musicTrack);
  }
  if (availableTracks.length === 0) {
    availableTracks = await prisma.musicTrack.findMany();
  }

  if (availableTracks.length === 0) {
    console.log('[Music] Geen music tracks in library, skip...');
    return { skipped: true, reason: 'Geen tracks in library' };
  }

  // Parse energy profiles
  for (const track of availableTracks) {
    try {
      track._energy = JSON.parse(track.energyProfile || '{}');
    } catch {
      track._energy = {};
    }
  }

  console.log(`[Music] ${availableTracks.length} tracks beschikbaar`);

  // ── 4. Match tracks aan segments ──
  const matchedSegments: Array<MusicSegment & { track: any; filePath: string }> = [];
  const usedTrackIds = new Set<string>();

  for (const seg of segments) {
    const track = findBestTrack(seg, availableTracks, usedTrackIds);
    if (track) {
      matchedSegments.push({
        ...seg,
        track,
        filePath: track.filePath,
      });
      usedTrackIds.add(track.id);
      console.log(`[Music] Segment ${seg.start}-${seg.end}s: "${track.title}" (mood: ${seg.mood} → ${track.mood})`);
    } else {
      console.log(`[Music] Segment ${seg.start}-${seg.end}s: geen track gevonden voor mood "${seg.mood}"`);
    }
  }

  if (matchedSegments.length === 0) {
    console.log('[Music] Geen tracks gematcht, skip...');
    return { skipped: true, reason: 'Geen tracks gematcht' };
  }

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

  // ── 6. Bouw music track ──
  const audioDir = path.join(projPath, 'audio');
  const editDir = path.join(projPath, 'edit');
  await fs.mkdir(audioDir, { recursive: true });
  await fs.mkdir(editDir, { recursive: true });

  const outputPath = path.join(audioDir, 'background-music.mp3');

  try {
    // Stap 6a: Bereid elk segment voor (trim, loop, fade)
    const segmentPaths: string[] = [];

    for (let i = 0; i < matchedSegments.length; i++) {
      const seg = matchedSegments[i];
      const segDuration = seg.end - seg.start;
      const segPath = path.join(editDir, `music-seg-${i}.wav`);

      // Check of bestand bestaat
      try {
        await fs.access(seg.filePath);
      } catch {
        console.log(`[Music] Track niet gevonden: ${seg.filePath}, skip segment...`);
        continue;
      }

      // Haal track duur op
      let trackDuration = seg.track.duration || 0;
      if (trackDuration === 0) {
        try {
          const probe = execSync(
            `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${seg.filePath}"`,
            { encoding: 'utf-8' }
          );
          trackDuration = parseFloat(probe.trim()) || 120;
        } catch {
          trackDuration = 120;
        }
      }

      // Converteer volume dB naar ffmpeg volume factor
      // -20dB ≈ volume=0.1, -15dB ≈ 0.18, -12dB ≈ 0.25
      const volumeFactor = Math.pow(10, (seg.volumeDb || -20) / 20);

      // Bouw ffmpeg filter
      const filters: string[] = [];

      // Als track korter is dan segment → loop
      if (trackDuration < segDuration) {
        // Gebruik -stream_loop om te loopen
        const loopCount = Math.ceil(segDuration / trackDuration);
        execSync(
          `ffmpeg -y -stream_loop ${loopCount} -i "${seg.filePath}" ` +
          `-t ${segDuration} -af "volume=${volumeFactor.toFixed(4)}" ` +
          `-ar 44100 -ac 2 "${segPath}"`,
          { stdio: 'pipe', timeout: 60_000 }
        );
      } else {
        // Track is lang genoeg → trim
        filters.push(`volume=${volumeFactor.toFixed(4)}`);

        // Fade in
        if (seg.fadeIn && seg.fadeIn > 0) {
          filters.push(`afade=t=in:st=0:d=${seg.fadeIn}`);
        }

        // Fade out
        if (seg.fadeOut && seg.fadeOut > 0) {
          const fadeOutStart = segDuration - seg.fadeOut;
          if (fadeOutStart > 0) {
            filters.push(`afade=t=out:st=${fadeOutStart}:d=${seg.fadeOut}`);
          }
        }

        const filterStr = filters.length > 0 ? `-af "${filters.join(',')}"` : '';

        execSync(
          `ffmpeg -y -i "${seg.filePath}" -t ${segDuration} ${filterStr} ` +
          `-ar 44100 -ac 2 "${segPath}"`,
          { stdio: 'pipe', timeout: 60_000 }
        );
      }

      // Voeg fades toe op geloopte tracks (apart pass)
      if (trackDuration < segDuration && (seg.fadeIn || seg.fadeOut)) {
        const fadePath = path.join(editDir, `music-seg-${i}-faded.wav`);
        const fadeFilters: string[] = [];
        if (seg.fadeIn && seg.fadeIn > 0) {
          fadeFilters.push(`afade=t=in:st=0:d=${seg.fadeIn}`);
        }
        if (seg.fadeOut && seg.fadeOut > 0) {
          const fadeOutStart = segDuration - seg.fadeOut;
          if (fadeOutStart > 0) {
            fadeFilters.push(`afade=t=out:st=${fadeOutStart}:d=${seg.fadeOut}`);
          }
        }
        if (fadeFilters.length > 0) {
          execSync(
            `ffmpeg -y -i "${segPath}" -af "${fadeFilters.join(',')}" "${fadePath}"`,
            { stdio: 'pipe', timeout: 30_000 }
          );
          try { await fs.unlink(segPath); } catch {}
          await fs.rename(fadePath, segPath);
        }
      }

      segmentPaths.push(segPath);
    }

    if (segmentPaths.length === 0) {
      return { skipped: true, reason: 'Geen music segmenten konden verwerkt worden' };
    }

    // Stap 6b: Combineer alle segmenten op een stille basis track
    const silentPath = path.join(editDir, 'music-silent.wav');
    execSync(
      `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${totalDuration} "${silentPath}"`,
      { stdio: 'pipe', timeout: 30_000 }
    );

    // Overlay elk segment op het juiste tijdstip
    let inputArgs = `-i "${silentPath}"`;
    const delayParts: string[] = [];

    for (let i = 0; i < segmentPaths.length; i++) {
      inputArgs += ` -i "${segmentPaths[i]}"`;
      const delayMs = Math.max(0, Math.round(matchedSegments[i].start * 1000));
      delayParts.push(`[${i + 1}:a]adelay=${delayMs}|${delayMs}[m${i}]`);
    }

    const mixInputs = ['[0:a]', ...segmentPaths.map((_, i) => `[m${i}]`)].join('');
    const filterComplex = [
      ...delayParts,
      `${mixInputs}amix=inputs=${segmentPaths.length + 1}:duration=first:dropout_transition=0[out]`
    ].join('; ');

    execSync(
      `ffmpeg -y ${inputArgs} -filter_complex "${filterComplex}" ` +
      `-map "[out]" -c:a libmp3lame -q:a 2 "${outputPath}"`,
      { stdio: 'pipe', timeout: 180_000 }
    );

    // Cleanup
    try { await fs.unlink(silentPath); } catch {}
    for (const sp of segmentPaths) {
      try { await fs.unlink(sp); } catch {}
    }

    console.log(`[Music] ✅ Background music opgeslagen: ${matchedSegments.length} segmenten → ${outputPath}`);

  } catch (error: any) {
    console.error(`[Music] ⚠ Fout bij music assemblage: ${error.message?.slice(0, 200)}`);

    // Fallback: gebruik eerste beschikbare track op laag volume als background
    try {
      const fallbackTrack = matchedSegments[0]?.filePath || availableTracks[0]?.filePath;
      if (fallbackTrack) {
        execSync(
          `ffmpeg -y -stream_loop -1 -i "${fallbackTrack}" -t ${totalDuration} ` +
          `-af "volume=0.08,afade=t=in:st=0:d=3,afade=t=out:st=${totalDuration - 3}:d=3" ` +
          `-c:a libmp3lame -q:a 2 "${outputPath}"`,
          { stdio: 'pipe', timeout: 60_000 }
        );
        console.log('[Music] Fallback: enkele track op laag volume als achtergrondmuziek');
      }
    } catch {
      return { skipped: true, reason: 'Music assemblage mislukt' };
    }
  }

  return {
    skipped: false,
    segmentsPlaced: matchedSegments.length,
    totalSegments: segments.length,
    outputFile: 'audio/background-music.mp3',
    segments: matchedSegments.map(s => ({
      start: s.start,
      end: s.end,
      mood: s.mood,
      track: s.track.title,
      volumeDb: s.volumeDb,
    })),
  };
}

// ══════════════════════════════════════════════════
// TRACK MATCHING LOGICA
// ══════════════════════════════════════════════════

function findBestTrack(
  segment: MusicSegment,
  available: any[],
  usedIds: Set<string>
): any | null {
  // 1. Specifiek track ID gevraagd
  if (segment.trackId) {
    const exact = available.find(t => t.id === segment.trackId);
    if (exact) return exact;
  }

  const segMood = segment.mood.toLowerCase();

  // 2. Score alle kandidaten
  const scored = available.map(track => {
    let score = 0;
    const trackMood = (track.mood || '').toLowerCase();
    const trackGenre = (track.genre || '').toLowerCase();

    // Directe mood match
    if (trackMood === segMood) score += 10;

    // Verwante moods
    const moodRelations: Record<string, string[]> = {
      tense: ['dark', 'dramatic'],
      dark: ['tense', 'dramatic'],
      dramatic: ['dark', 'energetic', 'tense'],
      uplifting: ['energetic', 'chill'],
      energetic: ['uplifting', 'dramatic'],
      chill: ['neutral', 'uplifting', 'ambient'],
      neutral: ['chill', 'corporate'],
      happy: ['uplifting', 'energetic'],
      sad: ['dark', 'chill'],
      suspense: ['dark', 'tense', 'dramatic'],
      epic: ['dramatic', 'energetic'],
    };

    const related = moodRelations[segMood] || [];
    if (related.includes(trackMood)) score += 6;

    // Genre match voor bepaalde moods
    if (segMood === 'cinematic' && trackGenre === 'cinematic') score += 5;
    if (segMood === 'corporate' && trackGenre === 'corporate') score += 5;

    // Variatie: niet-gebruikte tracks krijgen bonus
    if (!usedIds.has(track.id)) score += 3;

    // Voorkeur voor tracks zonder vocals (minder afleiding van voiceover)
    if (!track.hasVocals) score += 2;

    // BPM match (als beide beschikbaar)
    if (track.bpm) {
      // Snelle moods → hogere BPM gewenst
      const targetBpm = getBpmTarget(segMood);
      if (targetBpm) {
        const bpmDiff = Math.abs(track.bpm - targetBpm);
        if (bpmDiff < 15) score += 4;
        else if (bpmDiff < 30) score += 2;
      }
    }

    return { track, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored[0]?.score >= 3 ? scored[0].track : scored[0]?.track || null;
}

function getBpmTarget(mood: string): number | null {
  const targets: Record<string, number> = {
    energetic: 130,
    uplifting: 120,
    dramatic: 110,
    tense: 100,
    dark: 90,
    chill: 80,
    neutral: 100,
    sad: 70,
    epic: 120,
    suspense: 85,
  };
  return targets[mood] || null;
}
