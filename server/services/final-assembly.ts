/**
 * Final Assembly Service — Stap 23
 * 
 * Assembleert ALLE media tot de uiteindelijke video op basis van directors-cut.json.
 * 
 * v5 — 28 feb 2026:
 * - Color Grading en Subtitles geïntegreerd (was apart in stappen 18/19)
 * - N8N legacy fallback verwijderd
 * - SRT generatie uit timestamps.json
 * - Verbeterde ffmpeg filter chain (geen fragiele string replace meer)
 * - Robustere error handling met zwarte frame fallbacks
 * 
 * Assembly volgorde:
 * 1. Lees directors-cut.json als timeline
 * 2. Trim + schaal alle scene videos naar juiste formaat
 * 3. Concat alle segmenten
 * 4. Genereer SRT uit timestamps.json
 * 5. Pas color grading toe (uit project config)
 * 6. Mix voiceover + SFX track + achtergrondmuziek
 * 7. Bak subtitles in
 * 8. Final export → output/final.mp4
 * 
 * Output: {projectDir}/output/final.mp4
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const WORKSPACE_BASE = '/root/.openclaw/workspace/projects';

interface AssemblyResult {
  success: boolean;
  outputFile: string;
  duration: number;
  fileSizeMb: number;
  segmentsAssembled: number;
  colorGrading: string;
  subtitlesAdded: boolean;
  warnings: string[];
}

export async function executeFinalAssembly(project: any, settings: any): Promise<AssemblyResult> {
  const projPath = path.join(WORKSPACE_BASE, project.name);
  const outputDir = path.join(projPath, 'output');
  const editDir = path.join(projPath, 'edit');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(editDir, { recursive: true });

  const warnings: string[] = [];

  // ── 1. Lees Director's Cut ──
  let directorsCut: any;
  try {
    const dcText = await fs.readFile(path.join(editDir, 'directors-cut.json'), 'utf-8');
    directorsCut = JSON.parse(dcText);
  } catch {
    throw new Error("directors-cut.json niet gevonden. Voer eerst stap 16 (Director's Cut) uit.");
  }

  const timeline = directorsCut.timeline || [];
  if (timeline.length === 0) {
    throw new Error("Director's Cut bevat een lege timeline — kan geen video assembleren.");
  }

  console.log(`[Assembly] Start: ${timeline.length} segmenten, type: ${directorsCut.video_type || 'onbekend'}`);

  // ── 2. Bepaal resolutie en fps ──
  const isShort = project.output === 'youtube_short' || project.output === 'Shorts';
  const resolution = isShort ? '1080:1920' : '1920:1080';
  const resolutionXY = isShort ? '1080x1920' : '1920x1080';
  const fps = 30;

  // ── 3. Trim + schaal alle segmenten ──
  const trimmedDir = path.join(editDir, 'trimmed');
  await fs.mkdir(trimmedDir, { recursive: true });

  let segmentsReady = 0;

  for (const segment of timeline) {
    const assetPath = resolveAssetPath(projPath, segment.asset_path);
    const segId = String(segment.id).padStart(4, '0');
    const trimmedPath = path.join(trimmedDir, `seg-${segId}.mp4`);
    const duration = (segment.end || 0) - (segment.start || 0);

    if (duration <= 0) {
      warnings.push(`Segment ${segment.id}: ongeldige duur (${duration}s), overgeslagen`);
      continue;
    }

    try {
      if (await fileExists(assetPath)) {
        const isImage = /\.(jpg|jpeg|png|webp)$/i.test(assetPath);

        if (isImage) {
          // Image → video met Ken Burns zoom effect
          execSync(
            `ffmpeg -y -loop 1 -i "${assetPath}" -t ${duration} ` +
            `-vf "scale=${resolution}:force_original_aspect_ratio=decrease,pad=${resolution}:(ow-iw)/2:(oh-ih)/2,fps=${fps}" ` +
            `-c:v libx264 -preset fast -pix_fmt yuv420p -shortest "${trimmedPath}"`,
            { stdio: 'pipe', timeout: 30_000 }
          );
        } else {
          // Video → trim + schaal
          execSync(
            `ffmpeg -y -i "${assetPath}" -t ${duration} ` +
            `-vf "scale=${resolution}:force_original_aspect_ratio=decrease,pad=${resolution}:(ow-iw)/2:(oh-ih)/2,fps=${fps}" ` +
            `-c:v libx264 -preset fast -pix_fmt yuv420p -an "${trimmedPath}"`,
            { stdio: 'pipe', timeout: 60_000 }
          );
        }
        segmentsReady++;
      } else {
        warnings.push(`Segment ${segment.id}: asset niet gevonden (${segment.asset_path})`);
        createBlackFrame(trimmedPath, duration, resolutionXY, fps);
        segmentsReady++;
      }
    } catch (error: any) {
      warnings.push(`Segment ${segment.id}: trim mislukt — ${error.message?.slice(0, 100)}`);
      try {
        createBlackFrame(trimmedPath, duration, resolutionXY, fps);
        segmentsReady++;
      } catch {}
    }
  }

  console.log(`[Assembly] ${segmentsReady}/${timeline.length} segmenten getrimd`);

  if (segmentsReady === 0) {
    throw new Error('Geen bruikbare video segmenten — kan niet assembleren');
  }

  // ── 4. Concat alle segmenten ──
  const concatListPath = path.join(trimmedDir, 'concat.txt');
  const concatLines: string[] = [];

  for (const segment of timeline) {
    const segId = String(segment.id).padStart(4, '0');
    const trimmedPath = path.join(trimmedDir, `seg-${segId}.mp4`);
    if (await fileExists(trimmedPath)) {
      concatLines.push(`file '${trimmedPath}'`);
    }
  }

  if (concatLines.length === 0) {
    throw new Error('Geen video segmenten beschikbaar na trimming');
  }

  await fs.writeFile(concatListPath, concatLines.join('\n'), 'utf-8');

  const concatVideoPath = path.join(editDir, 'concat-raw.mp4');
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c:v libx264 -preset fast -pix_fmt yuv420p "${concatVideoPath}"`,
    { stdio: 'pipe', timeout: 300_000 }
  );

  console.log(`[Assembly] ${concatLines.length} segmenten samengevoegd`);

  // ── 5. Genereer SRT uit timestamps.json (als subtitles gewenst) ──
  const wantSubtitles = project.subtitles !== false;
  let srtPath = '';

  if (wantSubtitles) {
    const timestampsPath = path.join(projPath, 'audio', 'timestamps.json');
    srtPath = path.join(editDir, 'subtitles.srt');

    if (await fileExists(timestampsPath)) {
      try {
        const tsData = JSON.parse(await fs.readFile(timestampsPath, 'utf-8'));
        const srtContent = generateSRT(tsData, project.subtitleStyle || 'classic');
        await fs.writeFile(srtPath, srtContent, 'utf-8');
        console.log(`[Assembly] SRT gegenereerd: ${srtContent.split('\n\n').length} blokken`);
      } catch (err: any) {
        warnings.push(`SRT generatie mislukt: ${err.message}`);
        srtPath = '';
      }
    } else {
      warnings.push('timestamps.json niet gevonden — subtitles overgeslagen');
      srtPath = '';
    }
  }

  // ── 6. Bepaal color grading filter ──
  const colorGradeId = normalizeColorGradeId(project.colorGrading)
    || directorsCut.color_grade
    || 'none';
  const colorFilter = getColorGradeFilter(colorGradeId);
  const hasColorGrading = colorFilter !== null && colorGradeId !== 'none' && colorGradeId !== 'geen';

  console.log(`[Assembly] Color grading: ${colorGradeId} (${hasColorGrading ? 'actief' : 'geen'})`);

  // ── 7. Bouw video filter chain ──
  const videoFilters: string[] = [];

  if (hasColorGrading && colorFilter) {
    videoFilters.push(colorFilter);
  }

  if (srtPath && await fileExists(srtPath)) {
    const escapedSrtPath = srtPath.replace(/'/g, "'\\''").replace(/:/g, '\\:');
    videoFilters.push(`subtitles='${escapedSrtPath}'`);
  }

  const videoFilterArg = videoFilters.length > 0
    ? `-vf "${videoFilters.join(',')}"` : '';

  // ── 8. Verzamel audio bestanden ──
  const voiceoverPath = path.join(projPath, 'audio', 'voiceover.mp3');
  const musicPath = path.join(projPath, 'audio', 'background-music.mp3');
  const sfxPath = path.join(projPath, 'audio', 'sfx-track.mp3');

  const hasVoiceover = await fileExists(voiceoverPath);
  const hasMusic = await fileExists(musicPath);
  const hasSfx = await fileExists(sfxPath);

  if (!hasVoiceover) {
    warnings.push('Geen voiceover gevonden — video wordt zonder narration geëxporteerd');
  }

  // ── 9. Final export ──
  const finalPath = path.join(outputDir, 'final.mp4');

  if (hasVoiceover || hasMusic || hasSfx) {
    // ── Audio Loudness Normalisatie (EBU R128) ──
    // Stap 1: Normaliseer elke audio track individueel naar target LUFS
    // Stap 2: Mix alle genormaliseerde tracks
    // Stap 3: Finale loudnorm op de hele mix (YouTube target: -14 LUFS)
    //
    // Targets:
    //   Voiceover: -16 LUFS (primaire audio, moet duidelijk hoorbaar zijn)
    //   SFX:       -18 LUFS (iets onder voiceover, maar duidelijk)
    //   Music:     -30 LUFS (achtergrond, niet afleidend van voiceover)

    let audioInputs = '';
    const filterParts: string[] = [];
    let streamIdx = 1;

    if (hasVoiceover) {
      audioInputs += ` -i "${voiceoverPath}"`;
      filterParts.push(
        `[${streamIdx}:a]loudnorm=I=-16:TP=-1.5:LRA=11:print_format=none[vo]`
      );
      streamIdx++;
    }
    if (hasMusic) {
      audioInputs += ` -i "${musicPath}"`;
      filterParts.push(
        `[${streamIdx}:a]loudnorm=I=-30:TP=-2:LRA=7:print_format=none[bg]`
      );
      streamIdx++;
    }
    if (hasSfx) {
      audioInputs += ` -i "${sfxPath}"`;
      filterParts.push(
        `[${streamIdx}:a]loudnorm=I=-18:TP=-1.5:LRA=11:print_format=none[sfx]`
      );
      streamIdx++;
    }

    const mixStreams: string[] = [];
    if (hasVoiceover) mixStreams.push('[vo]');
    if (hasMusic) mixStreams.push('[bg]');
    if (hasSfx) mixStreams.push('[sfx]');

    // Mix alle streams samen, dan finale loudnorm naar YouTube standaard (-14 LUFS)
    filterParts.push(
      `${mixStreams.join('')}amix=inputs=${mixStreams.length}:duration=longest:dropout_transition=2[amixed]`
    );
    filterParts.push(
      `[amixed]loudnorm=I=-14:TP=-1:LRA=11:print_format=none[aout]`
    );

    const filterComplex = filterParts.join('; ');

    execSync(
      `ffmpeg -y -i "${concatVideoPath}"${audioInputs} ` +
      `-filter_complex "${filterComplex}" ` +
      `-map 0:v -map "[aout]" ${videoFilterArg} ` +
      `-c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -pix_fmt yuv420p ` +
      `-movflags +faststart -shortest "${finalPath}"`,
      { stdio: 'pipe', timeout: 600_000 }
    );
  } else {
    if (videoFilterArg) {
      execSync(
        `ffmpeg -y -i "${concatVideoPath}" ${videoFilterArg} ` +
        `-c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -movflags +faststart "${finalPath}"`,
        { stdio: 'pipe', timeout: 300_000 }
      );
    } else {
      await fs.copyFile(concatVideoPath, finalPath);
    }
  }

  // ── 10. Controleer output ──
  let duration = 0;
  let fileSizeMb = 0;

  try {
    const probe = execSync(
      `ffprobe -v quiet -show_entries format=duration,size -of csv=p=0 "${finalPath}"`,
      { encoding: 'utf-8' }
    );
    const [dur, size] = probe.trim().split(',');
    duration = Math.round(parseFloat(dur) || 0);
    fileSizeMb = Math.round((parseInt(size) || 0) / 1024 / 1024 * 10) / 10;
  } catch {}

  // Cleanup
  try { await fs.unlink(concatVideoPath); } catch {}

  console.log(`[Assembly] ✅ Final video: ${duration}s, ${fileSizeMb}MB, ${segmentsReady} segmenten, ${warnings.length} waarschuwingen`);

  return {
    success: true,
    outputFile: 'output/final.mp4',
    duration,
    fileSizeMb,
    segmentsAssembled: segmentsReady,
    colorGrading: hasColorGrading ? colorGradeId : 'none',
    subtitlesAdded: srtPath !== '' && await fileExists(srtPath),
    warnings,
  };
}

// ── SRT Generatie uit timestamps.json ──

function generateSRT(timestampData: any, style: string = 'classic'): string {
  const words = timestampData.words || timestampData.results?.items || [];
  if (words.length === 0) return '';

  const blocks: Array<{ start: number; end: number; text: string }> = [];
  let currentBlock: typeof words = [];
  const MAX_WORDS = 8;
  const PAUSE_THRESHOLD_MS = 500;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word.text || word.text.trim() === '') continue;

    currentBlock.push(word);

    const nextWord = words[i + 1];
    const isPause = nextWord && (nextWord.start - word.end) > PAUSE_THRESHOLD_MS;
    const isMaxWords = currentBlock.length >= MAX_WORDS;
    const isLast = i === words.length - 1;

    if (isPause || isMaxWords || isLast) {
      if (currentBlock.length > 0) {
        blocks.push({
          start: currentBlock[0].start,
          end: currentBlock[currentBlock.length - 1].end,
          text: currentBlock.map((w: any) => w.text).join(' '),
        });
        currentBlock = [];
      }
    }
  }

  const srtLines: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    srtLines.push(`${i + 1}`);
    srtLines.push(`${msToSrtTime(block.start)} --> ${msToSrtTime(block.end)}`);
    srtLines.push(block.text);
    srtLines.push('');
  }

  return srtLines.join('\n');
}

function msToSrtTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

// ── Helpers ──

function resolveAssetPath(projPath: string, assetPath: string): string {
  if (!assetPath) return '';
  if (path.isAbsolute(assetPath)) return assetPath;
  return path.join(projPath, assetPath);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function createBlackFrame(outputPath: string, duration: number, resolution: string, fps: number): void {
  execSync(
    `ffmpeg -y -f lavfi -i "color=c=black:s=${resolution}:d=${duration}:r=${fps}" ` +
    `-c:v libx264 -preset ultrafast -pix_fmt yuv420p "${outputPath}"`,
    { stdio: 'pipe', timeout: 10_000 }
  );
}

/**
 * Normaliseer color grade naam naar id
 * "Cinematic Dark" → "cinematic_dark", "Geen" → "none"
 */
function normalizeColorGradeId(name: string | null | undefined): string {
  if (!name) return 'none';
  const lower = name.toLowerCase().trim();
  if (lower === 'geen' || lower === 'geen color grading' || lower === 'none') return 'none';
  return lower.replace(/\s+/g, '_');
}

function getColorGradeFilter(gradeId: string): string | null {
  const grades: Record<string, string> = {
    cinematic_dark: "eq=brightness=-0.05:contrast=1.3:saturation=0.8,curves=preset=cross_process,vignette=PI/4",
    history_warm: "eq=brightness=0.02:contrast=1.1:saturation=0.9,colorbalance=rs=0.05:gs=0.02:bs=-0.05:rm=0.03:gm=0.01:bm=-0.03,vignette=PI/5",
    vibrant: "eq=brightness=0.03:contrast=1.15:saturation=1.4,curves=preset=lighter",
    clean_neutral: "eq=brightness=0.02:contrast=1.05:saturation=1.1",
    cold_blue: "eq=brightness=-0.02:contrast=1.2:saturation=0.85,colorbalance=rs=-0.05:gs=-0.02:bs=0.08:rm=-0.03:gm=-0.01:bm=0.05,vignette=PI/4",
    noir: "eq=brightness=-0.03:contrast=1.4:saturation=0.3,vignette=PI/3",
  };
  return grades[gradeId] || null;
}
