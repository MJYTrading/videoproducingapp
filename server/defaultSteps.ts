export interface StepDefinition {
  stepNumber: number;
  name: string;
  description: string;
  executor: string;
  readyToUse: boolean;
}

export const DEFAULT_STEPS: StepDefinition[] = [
  { stepNumber: 0,  name: 'Ideation',                  description: 'Het bedenken van je video idee',                executor: 'App',              readyToUse: false },
  { stepNumber: 1,  name: 'Project Formulier',          description: 'Het invullen van het project formulier',       executor: 'App',              readyToUse: true },
  { stepNumber: 2,  name: 'Research JSON',              description: 'Het invullen van een research document',       executor: 'Perplexity',       readyToUse: false },
  { stepNumber: 3,  name: 'Transcripts Ophalen',        description: 'Het ophalen van de referentie transcripts',    executor: 'App',              readyToUse: true },
  { stepNumber: 4,  name: 'Trending Clips Research',    description: 'Het opzoeken en onderzoeken van clips',        executor: 'Perplexity',       readyToUse: false },
  { stepNumber: 5,  name: 'Style Profile',              description: 'Het invullen van de schrijfstijl',             executor: 'Elevate AI',       readyToUse: true },
  { stepNumber: 6,  name: 'Script Schrijven',           description: 'Het schrijven van het script',                 executor: 'Elevate AI',       readyToUse: true },
  { stepNumber: 7,  name: 'Voice Over',                 description: 'Het genereren van de voiceover',               executor: 'Elevate',          readyToUse: true },
  { stepNumber: 8,  name: 'Avatar / Spokesperson',      description: 'Het invoeren van de avatar / spokesperson',    executor: 'HeyGen',          readyToUse: false },
  { stepNumber: 9,  name: 'Timestamps Ophalen',         description: 'Het ophalen van de timestamps van de tekst',   executor: 'Assembly AI',      readyToUse: true },
  { stepNumber: 10, name: 'Scene Prompts',              description: 'Het genereren van image prompts',              executor: 'Elevate AI',       readyToUse: true },
  { stepNumber: 11, name: 'Assets Zoeken',              description: 'Het zoeken van benodigde assets',              executor: 'TwelveLabs + N8N', readyToUse: true },
  { stepNumber: 12, name: 'Clips Downloaden',           description: 'Het downloaden van benodigde clips',           executor: 'N8N',              readyToUse: true },
  { stepNumber: 13, name: 'Images Genereren',           description: 'Het genereren van images',                     executor: 'Elevate',          readyToUse: true },
  { stepNumber: 14, name: 'Video Scenes Genereren',     description: 'Het genereren van videos',                     executor: 'Elevate',          readyToUse: true },
  { stepNumber: 15, name: 'Orchestrator',               description: 'De video editing bepalen',                     executor: 'Claude Opus',      readyToUse: false },
  { stepNumber: 16, name: 'Achtergrondmuziek',          description: 'Het toevoegen van achtergrondmuziek',          executor: 'FFMPEG',           readyToUse: false },
  { stepNumber: 17, name: 'Color Grading',              description: 'Het toevoegen van color grading',              executor: 'FFMPEG',           readyToUse: true },
  { stepNumber: 18, name: 'Subtitles',                  description: 'Het toevoegen van ondertiteling',              executor: 'FFMPEG',           readyToUse: true },
  { stepNumber: 19, name: 'Overlay',                    description: 'Het toevoegen van overlay',                    executor: 'FFMPEG',           readyToUse: false },
  { stepNumber: 20, name: 'Sound Effects',              description: 'Het toevoegen van sound effects',              executor: 'FFMPEG',           readyToUse: true },
  { stepNumber: 21, name: 'Video Effects',              description: 'Het toevoegen van video effects',              executor: 'FFMPEG',           readyToUse: true },
  { stepNumber: 22, name: 'Final Export',               description: 'Het exporteren van de video',                  executor: 'FFMPEG',           readyToUse: true },
  { stepNumber: 23, name: 'Thumbnail',                  description: 'Het maken van de thumbnail',                   executor: 'App',              readyToUse: false },
  { stepNumber: 24, name: 'Drive Upload',               description: 'Het uploaden van het pakket in drive',         executor: 'App',              readyToUse: true },
];

// Mapping van oude stepNumbers naar nieuwe (voor migratie referentie)
// Oud 0 (Config) → Nieuw 1 (Project Formulier)
// Oud 1 (Transcripts) → Nieuw 3
// Oud 2 (Style) → Nieuw 5
// Oud 3 (Script) → Nieuw 6
// Oud 4 (Voiceover) → Nieuw 7
// Oud 5 (Timestamps) → Nieuw 9
// Oud 6 (Scene prompts) → Nieuw 10
// Oud 65 (Scene images) → Nieuw 13
// Oud 7 (Assets) → Nieuw 11
// Oud 8 (Clips) → Nieuw 12
// Oud 9 (Video scenes) → Nieuw 14
// Oud 10 (Video editing) → Nieuw 21 (Video Effects)
// Oud 11 (Color grading) → Nieuw 17
// Oud 12 (Subtitles) → Nieuw 18
// Oud 13 (Final export) → Nieuw 22
// Oud 14 (Drive upload) → Nieuw 24
