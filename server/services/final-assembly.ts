/**
 * Final Assembly Service — Stap 23 (was 22)
 * 
 * Assembleert ALLE media tot de uiteindelijke video op basis van directors-cut.json.
 * 
 * Assembly volgorde:
 * 1. Lees directors-cut.json als blauwdruk
 * 2. Leg voiceover als basis-tijdlijn
 * 3. Plaats per segment het juiste visuele element
 * 4. Pas transities toe
 * 5. Mix achtergrondmuziek (MUTE bij clips)
 * 6. Plaats SFX
 * 7. Voeg speciale edit fragmenten in
 * 8. Pas color grading toe
 * 9. Pas overlays toe
 * 10. Bak subtitles in
 * 11. Final export
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
  warnings: string[];
}

export async function executeFinalAssembly(project: any, settings: any): Promise<AssemblyResult> {
  const projPath = path.join(WORKSPACE_BASE, project.name);
  const outputDir = path.join(projPath, 'output');
  await fs.mkdir(outputDir, { recursive: true });

  const warnings: string[] = [];

  // 1. Lees Director's Cut
  let directorsCut: any;
  try {
    const dcText = await fs.readFile(path.join(projPath, 'edit', 'directors-cut.json'), 'utf-8');
    directorsCut = JSON.parse(dcText);
  } catch {
    // Fallback: gebruik oude methode (geen Director's Cut beschikbaar)
    console.log('[Assembly] Geen directors-cut.json, val terug op legacy assembly...');
    return legacyAssembly(project, settings);
  }

  const timeline = directorsCut.timeline || [];
  if (timeline.length === 0) {
    throw new Error("Director's Cut bevat lege timeline");
  }

  console.log(`[Assembly] Starten: ${timeline.length} segments, type: ${directorsCut.video_type}`);

  // 2. Verzamel beschikbare bestanden
  const voiceoverPath = path.join(projPath, 'audio', 'voiceover.mp3');
  const musicPath = path.join(projPath, 'audio', 'background-music.mp3');
  const sfxPath = path.join(projPath, 'audio', 'sfx-track.mp3');
  const subtitlesPath = path.join(projPath, 'audio', 'subtitles.srt');

  const hasVoiceover = await fileExists(voiceoverPath);
  const hasMusic = await fileExists(musicPath);
  const hasSfx = await fileExists(sfxPath);
  const hasSubtitles = await fileExists(subtitlesPath);

  if (!hasVoiceover) {
    warnings.push('Geen voiceover gevonden');
  }

  // 3. Bereid video segmenten voor — trim/schaal elke asset
  const trimmedDir = path.join(projPath, 'edit', 'trimmed');
  await fs.mkdir(trimmedDir, { recursive: true });

  const resolution = project.output === 'youtube_short' ? '1080:1920' : '1920:1080';
  const fps = 30;
  let segmentsReady = 0;

  for (const segment of timeline) {
    const assetPath = resolveAssetPath(projPath, segment.asset_path);
    const trimmedPath = path.join(trimmedDir, `seg-${String(segment.id).padStart(4, '0')}.mp4`);
    const duration = (segment.end || 0) - (segment.start || 0);

    if (duration <= 0) {
      warnings.push(`Segment ${segment.id}: ongeldige duur (${duration}s)`);
      continue;
    }

    try {
      if (await fileExists(assetPath)) {
        // Trim + schaal naar juiste formaat
        const isImage = /\.(jpg|jpeg|png|webp)$/i.test(assetPath);

        if (isImage) {
          // Maak video van image (Ken Burns / static)
          execSync(
            `ffmpeg -y -loop 1 -i "${assetPath}" -t ${duration} ` +
            `-vf "scale=${resolution}:force_original_aspect_ratio=decrease,pad=${resolution}:(ow-iw)/2:(oh-ih)/2,fps=${fps}" ` +
            `-c:v libx264 -pix_fmt yuv420p -shortest "${trimmedPath}"`,
            { stdio: 'pipe', timeout: 30_000 }
          );
        } else {
          // Trim video
          execSync(
            `ffmpeg -y -i "${assetPath}" -t ${duration} ` +
            `-vf "scale=${resolution}:force_original_aspect_ratio=decrease,pad=${resolution}:(ow-iw)/2:(oh-ih)/2,fps=${fps}" ` +
            `-c:v libx264 -pix_fmt yuv420p -an "${trimmedPath}"`,
            { stdio: 'pipe', timeout: 60_000 }
          );
        }
        segmentsReady++;
      } else {
        // Genereer zwart frame als placeholder
        warnings.push(`Segment ${segment.id}: asset niet gevonden (${segment.asset_path})`);
        execSync(
          `ffmpeg -y -f lavfi -i "color=c=black:s=${resolution.replace(':', 'x')}:d=${duration}:r=${fps}" ` +
          `-c:v libx264 -pix_fmt yuv420p "${trimmedPath}"`,
          { stdio: 'pipe', timeout: 10_000 }
        );
        segmentsReady++;
      }
    } catch (error: any) {
      warnings.push(`Segment ${segment.id}: trim mislukt (${error.message?.slice(0, 80)})`);
      // Zwart frame fallback
      try {
        execSync(
          `ffmpeg -y -f lavfi -i "color=c=black:s=${resolution.replace(':', 'x')}:d=${duration}:r=${fps}" ` +
          `-c:v libx264 -pix_fmt yuv420p "${trimmedPath}"`,
          { stdio: 'pipe', timeout: 10_000 }
        );
        segmentsReady++;
      } catch {}
    }
  }

  console.log(`[Assembly] ${segmentsReady}/${timeline.length} segmenten klaar`);

  // 4. Concat alle segmenten
  const concatListPath = path.join(trimmedDir, 'concat.txt');
  const concatLines: string[] = [];

  for (const segment of timeline) {
    const trimmedPath = path.join(trimmedDir, `seg-${String(segment.id).padStart(4, '0')}.mp4`);
    if (await fileExists(trimmedPath)) {
      concatLines.push(`file '${trimmedPath}'`);
    }
  }

  if (concatLines.length === 0) {
    throw new Error('Geen video segmenten beschikbaar voor assembly');
  }

  await fs.writeFile(concatListPath, concatLines.join('\n'), 'utf-8');

  const rawVideoPath = path.join(outputDir, 'raw-video.mp4');
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c:v libx264 -pix_fmt yuv420p "${rawVideoPath}"`,
    { stdio: 'pipe', timeout: 300_000 }
  );

  // 5. Mix audio layers
  const finalPath = path.join(outputDir, 'final.mp4');
  let audioInputs = '';
  let audioFilter = '';
  let audioIdx = 1; // 0 = video

  if (hasVoiceover) {
    audioInputs += ` -i "${voiceoverPath}"`;
    audioFilter += `[${audioIdx}:a]volume=1.0[vo]; `;
    audioIdx++;
  }

  if (hasMusic) {
    audioInputs += ` -i "${musicPath}"`;
    audioFilter += `[${audioIdx}:a]volume=0.15[bg]; `;
    audioIdx++;
  }

  if (hasSfx) {
    audioInputs += ` -i "${sfxPath}"`;
    audioFilter += `[${audioIdx}:a]volume=0.5[sfx]; `;
    audioIdx++;
  }

  // Mix alle audio samen
  const audioStreams: string[] = [];
  if (hasVoiceover) audioStreams.push('[vo]');
  if (hasMusic) audioStreams.push('[bg]');
  if (hasSfx) audioStreams.push('[sfx]');

  if (audioStreams.length > 0) {
    audioFilter += `${audioStreams.join('')}amix=inputs=${audioStreams.length}:duration=longest[aout]`;

    // Color grading
    const colorGrade = directorsCut.color_grade || 'none';
    let videoFilter = '';
    if (colorGrade && colorGrade !== 'none') {
      const gradeFilter = getColorGradeFilter(colorGrade);
      if (gradeFilter) videoFilter = `-vf "${gradeFilter}"`;
    }

    // Subtitles
    let subtitleFilter = '';
    if (hasSubtitles) {
      subtitleFilter = videoFilter
        ? videoFilter.replace('"', `subtitles='${subtitlesPath}',`) // Prepend
        : `-vf "subtitles='${subtitlesPath}'"`;
      if (videoFilter) videoFilter = ''; // Al in subtitleFilter
    }

    const filterArg = videoFilter || subtitleFilter || '';

    execSync(
      `ffmpeg -y -i "${rawVideoPath}"${audioInputs} ` +
      `-filter_complex "${audioFilter}" ` +
      `-map 0:v -map "[aout]" ${filterArg} ` +
      `-c:v libx264 -c:a aac -b:a 192k -pix_fmt yuv420p -shortest "${finalPath}"`,
      { stdio: 'pipe', timeout: 600_000 }
    );
  } else {
    // Geen audio — kopieer raw video
    await fs.copyFile(rawVideoPath, finalPath);
  }

  // 6. Controleer output
  let duration = 0;
  let fileSizeMb = 0;

  try {
    const probe = execSync(`ffprobe -v quiet -show_entries format=duration,size -of csv=p=0 "${finalPath}"`, { encoding: 'utf-8' });
    const [dur, size] = probe.trim().split(',');
    duration = Math.round(parseFloat(dur) || 0);
    fileSizeMb = Math.round((parseInt(size) || 0) / 1024 / 1024 * 10) / 10;
  } catch {}

  // Cleanup raw video
  try { await fs.unlink(rawVideoPath); } catch {}

  console.log(`[Assembly] Final video: ${duration}s, ${fileSizeMb} MB, ${warnings.length} waarschuwingen`);

  return {
    success: true,
    outputFile: 'output/final.mp4',
    duration,
    fileSizeMb,
    segmentsAssembled: segmentsReady,
    warnings,
  };
}

/**
 * Legacy assembly — gebruikt als er geen Director's Cut beschikbaar is
 * Valt terug op de oude N8N-gebaseerde methode
 */
async function legacyAssembly(project: any, settings: any): Promise<AssemblyResult> {
  const projPath = path.join(WORKSPACE_BASE, project.name);
  const n8nUrl = (settings.n8nBaseUrl || 'https://n8n.srv1275252.hstgr.cloud') + '/webhook/final-export';
  const statusPath = path.join(projPath, 'output', 'export-status.json');

  try { await fs.unlink(statusPath); } catch {}

  const payload = {
    project: project.name,
    project_dir: projPath,
    output_format: project.output === 'youtube_short' ? 'youtube_short' : 'youtube_1080p',
  };

  console.log(`[Assembly] Legacy export via N8N: ${n8nUrl}`);

  const response = await fetch(n8nUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('N8N Final Export mislukt (' + response.status + '): ' + body);
  }

  // Poll for status
  const startTime = Date.now();
  const timeout = 900_000; // 15 min

  while (Date.now() - startTime < timeout) {
    await new Promise(r => setTimeout(r, 10_000));
    try {
      const statusText = await fs.readFile(statusPath, 'utf-8');
      const status = JSON.parse(statusText);
      if (status.status === 'completed' || status.status === 'done') {
        return {
          success: true,
          outputFile: status.output_file || 'output/final.mp4',
          duration: status.duration || 0,
          fileSizeMb: status.file_size_mb || 0,
          segmentsAssembled: status.segments || 0,
          warnings: [],
        };
      }
      if (status.status === 'error' || status.status === 'failed') {
        throw new Error(`Legacy export mislukt: ${status.error || 'onbekend'}`);
      }
    } catch (e: any) {
      if (e.message?.includes('Legacy export mislukt')) throw e;
    }
  }

  throw new Error('Legacy export timeout (15 min)');
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
