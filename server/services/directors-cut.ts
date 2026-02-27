/**
 * Director's Cut Service — AI Regisseur
 * 
 * Maakt een compleet editingplan/blauwdruk voor de hele video.
 * Dit plan stuurt alle vervolgstappen aan (muziek, SFX, overlay, assembly).
 * 
 * Stap 16 in pipeline (was 15 in spec).
 * Gebruikt Claude Opus 4.5 via Elevate.
 */

import fs from 'fs/promises';
import path from 'path';
import prisma from '../db.js';
import { llmSimplePrompt, LLM_MODELS } from './llm.js';

const WORKSPACE_BASE = '/root/.openclaw/workspace/projects';

interface DirectorsCutInput {
  project: any;
  settings: any;
  llmKeys: any;
}

export async function executeDirectorsCut({ project, settings, llmKeys }: DirectorsCutInput): Promise<any> {
  const projPath = path.join(WORKSPACE_BASE, project.name);
  const editDir = path.join(projPath, 'edit');
  await fs.mkdir(editDir, { recursive: true });

  // ── 1. Verzamel alle inputs ──

  const dataParts: string[] = [];

  // Script met timestamps
  try {
    const script = await fs.readFile(path.join(projPath, 'audio', 'timestamped-script.json'), 'utf-8');
    dataParts.push(`=== SCRIPT MET TIMESTAMPS ===\n${script}`);
  } catch {
    try {
      const script = await fs.readFile(path.join(projPath, 'script', 'script.txt'), 'utf-8');
      dataParts.push(`=== SCRIPT ===\n${script}`);
    } catch { dataParts.push('=== SCRIPT ===\nNiet beschikbaar'); }
  }

  // Asset map (B-roll, scenes)
  try {
    const assetMap = await fs.readFile(path.join(projPath, 'assets', 'asset-map.json'), 'utf-8');
    dataParts.push(`=== BESCHIKBARE ASSETS (B-ROLL) ===\n${assetMap}`);
  } catch {}

  // Scene prompts (AI images/videos)
  try {
    const scenePrompts = await fs.readFile(path.join(projPath, 'assets', 'scene-prompts.json'), 'utf-8');
    dataParts.push(`=== SCENE PROMPTS ===\n${scenePrompts}`);
  } catch {}

  // Image selections
  try {
    const selections = await fs.readFile(path.join(projPath, 'assets', 'image-selections.json'), 'utf-8');
    dataParts.push(`=== AI GENERATED IMAGES ===\n${selections}`);
  } catch {}

  // Clips
  try {
    const clipsStatus = await fs.readFile(path.join(projPath, 'assets', 'clips-status.json'), 'utf-8');
    dataParts.push(`=== GEDOWNLOADE CLIPS ===\n${clipsStatus}`);
  } catch {}

  // Clips research (voor context)
  try {
    const clipsResearch = await fs.readFile(path.join(projPath, 'research', 'clips-research.json'), 'utf-8');
    dataParts.push(`=== CLIPS RESEARCH ===\n${clipsResearch}`);
  } catch {}

  // Style Profile
  try {
    const style = await fs.readFile(path.join(projPath, 'style_profile.txt'), 'utf-8');
    dataParts.push(`=== STYLE PROFILE ===\n${style}`);
  } catch {}

  // Research
  try {
    const research = await fs.readFile(path.join(projPath, 'research', 'research.json'), 'utf-8');
    dataParts.push(`=== RESEARCH ===\n${JSON.parse(research) ? research.substring(0, 3000) : ''}`);
  } catch {}

  // Script outline (van stap 6)
  try {
    const outline = await fs.readFile(path.join(projPath, 'script_outline.json'), 'utf-8');
    dataParts.push(`=== SCRIPT OUTLINE ===\n${outline}`);
  } catch {}

  // Config
  const config = typeof project.config === 'string' ? JSON.parse(project.config) : (project.config || {});

  // Color grading
  dataParts.push(`=== COLOR GRADING ===\n${config.colorGrading || 'Geen'}`);

  // ── 2. Beschikbare muziek (gefilterd op kanaal) ──
  let musicTracks: any[] = [];
  if (project.channelId) {
    const selections = await prisma.channelMusicSelection.findMany({
      where: { channelId: project.channelId },
      include: { musicTrack: true },
    });
    musicTracks = selections.map(s => s.musicTrack);
  }
  if (musicTracks.length === 0) {
    musicTracks = await prisma.musicTrack.findMany({ take: 20 });
  }
  if (musicTracks.length > 0) {
    dataParts.push(`=== BESCHIKBARE MUZIEK ===\n${JSON.stringify(musicTracks.map(t => ({
      id: t.id, title: t.title, duration: t.duration, mood: t.mood, genre: t.genre,
      bpm: t.bpm, energyProfile: t.energyProfile, hasVocals: t.hasVocals, loopable: t.loopable,
    })), null, 2)}`);
  }

  // ── 3. Beschikbare SFX (gefilterd op kanaal) ──
  let sfx: any[] = [];
  if (project.channelId) {
    const sfxSelections = await prisma.channelSfxSelection.findMany({
      where: { channelId: project.channelId },
      include: { soundEffect: true },
    });
    sfx = sfxSelections.map(s => s.soundEffect);
  }
  if (sfx.length === 0) {
    sfx = await prisma.soundEffect.findMany({ take: 30 });
  }
  if (sfx.length > 0) {
    dataParts.push(`=== BESCHIKBARE SOUND EFFECTS ===\n${JSON.stringify(sfx.map(s => ({
      id: s.id, name: s.name, filePath: s.filePath, duration: s.duration,
      category: s.category, usageRules: s.usageRules,
    })), null, 2)}`);
  }

  // ── 4. Special Edits ──
  let specialEdits: any[] = [];
  if (project.channelId) {
    const seSelections = await prisma.channelSpecialEditSelection.findMany({
      where: { channelId: project.channelId },
      include: { specialEdit: true },
    });
    specialEdits = seSelections.map(s => s.specialEdit);
  }
  if (specialEdits.length > 0) {
    dataParts.push(`=== BESCHIKBARE SPECIAL EDITS ===\n${JSON.stringify(specialEdits.map(e => ({
      id: e.id, name: e.name, description: e.description, category: e.category,
      ffmpegTemplate: e.ffmpegTemplate, parameters: e.parameters,
    })), null, 2)}`);
  }

  // ── 5. Overlay preset ──
  if (project.channelId) {
    const channel = await prisma.channel.findUnique({
      where: { id: project.channelId },
      include: { overlayPreset: true },
    });
    if (channel?.overlayPreset) {
      dataParts.push(`=== OVERLAY PRESET ===\n${JSON.stringify(channel.overlayPreset, null, 2)}`);
    }
  }

  // ── 6. Editing Knowledge ──
  if (project.channelId) {
    const knowledge = await prisma.editingKnowledge.findMany({
      where: { channelId: project.channelId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    if (knowledge.length > 0) {
      dataParts.push(`=== EDITING KENNISDATABASE (eerdere beslissingen) ===\n${JSON.stringify(knowledge.map(k => ({
        context: k.context, decision: k.decision, reasoning: k.reasoning,
      })), null, 2)}`);
    }
  }

  // ── 7. LLM Call — Claude Opus ──

  const systemPrompt = `Je bent een expert video regisseur. Je maakt een compleet, gedetailleerd editingplan (Director's Cut) voor een YouTube video.

Je krijgt: script met timestamps, beschikbare assets (B-roll, AI scenes, clips), muziek, SFX, overlay preset, en editing kennis.

HARDE REGELS:
1. Bij clips zonder voiceover → muziek volume = 0 (mute) met korte fade-out ervoor en fade-in erna. De clip speelt met eigen audio.
2. Bij spokesperson types → dikgedrukte tekst uit script = spokesperson video zichtbaar. Rest van de tijd: andere footage.
3. Spokesperson audio loopt altijd door als voiceover — alleen de VIDEO wisselt.
4. Elke seconde van de video moet gedekt zijn door een asset (geen zwarte frames).
5. Transitions moeten logisch zijn: cuts voor snelle secties, fades voor rustige momenten.

Geef je antwoord als JSON met EXACT deze structuur:
{
  "version": "1.0",
  "video_type": "${project.videoType || 'ai'}",
  "total_duration": 0,
  "timeline": [
    {
      "id": 1,
      "start": 0.0,
      "end": 4.2,
      "type": "b-roll|clip|ai-scene|spokesperson",
      "asset_path": "assets/scenes/scene-001.mp4",
      "voiceover_active": true,
      "transition_in": { "type": "fade|cut|glitch|dissolve", "duration": 0.5 },
      "transition_out": { "type": "cut", "duration": 0 },
      "overlay": null,
      "subtitle_text": "...",
      "sfx": [{ "type": "whoosh", "at": 0.0, "sfx_id": "..." }],
      "special_edit": null
    }
  ],
  "music": {
    "segments": [
      {
        "start": 0, "end": 60, "mood": "tense",
        "track_id": "...", "volume_db": -18,
        "fade_in": { "duration": 2.0, "type": "linear" },
        "fade_out": null
      }
    ]
  },
  "color_grade": "${config.colorGrading || 'none'}",
  "overlay_preset_id": null,
  "global_settings": {
    "subtitle_style": { "font": "bold_white_shadow", "position": "bottom_center", "size": 48 },
    "default_transition": "cut"
  },
  "special_edits": []
}

Geef ALLEEN de JSON terug.`;

  const userPrompt = `VIDEO: ${project.title}
VIDEO TYPE: ${project.videoType || 'ai'}

${dataParts.join('\n\n')}

Maak het complete editingplan. Gebruik alle beschikbare assets, muziek en SFX. Zorg dat de HELE video tijdlijn gedekt is.`;

  console.log(`[DirectorsCut] Starting met Claude Opus 4.5...`);
  console.log(`[DirectorsCut] Input: ${dataParts.length} data secties, ${musicTracks.length} tracks, ${sfx.length} sfx`);

  const response = await llmSimplePrompt(llmKeys, systemPrompt, userPrompt, {
    model: LLM_MODELS.OPUS,
    maxTokens: 16384,
    temperature: 0.5,
  });

  // ── 8. Parse en opslaan ──
  let directorsCut: any;
  try {
    directorsCut = JSON.parse(response);
  } catch {
    const match = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      directorsCut = JSON.parse(match[1].trim());
    } else {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        directorsCut = JSON.parse(jsonMatch[0]);
      } else {
        await fs.writeFile(path.join(editDir, 'directors-cut-raw.txt'), response, 'utf-8');
        throw new Error("Director's Cut response bevat geen geldige JSON");
      }
    }
  }

  // Voeg project info toe
  directorsCut.project_id = project.id;

  await fs.writeFile(
    path.join(editDir, 'directors-cut.json'),
    JSON.stringify(directorsCut, null, 2),
    'utf-8'
  );

  const timelineItems = directorsCut.timeline?.length || 0;
  const musicSegments = directorsCut.music?.segments?.length || 0;

  console.log(`[DirectorsCut] Plan opgeslagen: ${timelineItems} timeline items, ${musicSegments} muziek segments`);

  return {
    success: true,
    timelineItems,
    musicSegments,
    totalDuration: directorsCut.total_duration || 0,
    outputFile: 'edit/directors-cut.json',
  };
}
