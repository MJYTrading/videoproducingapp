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
  { stepNumber: 2,  name: 'Research JSON',              description: 'Het invullen van een research document',       executor: 'Elevate Sonar',    readyToUse: true },
  { stepNumber: 3,  name: 'Transcripts Ophalen',        description: 'Het ophalen van de referentie transcripts',    executor: 'App',              readyToUse: true },
  { stepNumber: 4,  name: 'Trending Clips Research',    description: 'Het opzoeken en onderzoeken van clips',        executor: 'Elevate Sonar',    readyToUse: true },
  { stepNumber: 5,  name: 'Style Profile',              description: 'Het invullen van de schrijfstijl',             executor: 'Elevate AI',       readyToUse: true },
  { stepNumber: 6,  name: 'Script Orchestrator',        description: 'Het plannen van de video structuur en outline', executor: 'Elevate Opus',     readyToUse: true },
  { stepNumber: 7,  name: 'Script Schrijven',           description: 'Het schrijven van het script',                 executor: 'Elevate AI',       readyToUse: true },
  { stepNumber: 8,  name: 'Voice Over',                 description: 'Het genereren van de voiceover',               executor: 'Elevate',          readyToUse: true },
  { stepNumber: 9,  name: 'Avatar / Spokesperson',      description: 'Het invoeren van de avatar / spokesperson',    executor: 'HeyGen',          readyToUse: false },
  { stepNumber: 10, name: 'Timestamps Ophalen',         description: 'Het ophalen van de timestamps van de tekst',   executor: 'Assembly AI',      readyToUse: true },
  { stepNumber: 11, name: 'Scene Prompts',              description: 'Het genereren van image prompts',              executor: 'Elevate AI',       readyToUse: true },
  { stepNumber: 12, name: 'Assets Zoeken',              description: 'Het zoeken van benodigde assets',              executor: 'TwelveLabs + N8N', readyToUse: true },
  { stepNumber: 13, name: 'Clips Downloaden',           description: 'Het downloaden van benodigde clips',           executor: 'N8N',              readyToUse: true },
  { stepNumber: 14, name: 'Images Genereren',           description: 'Het genereren van images',                     executor: 'Elevate',          readyToUse: true },
  { stepNumber: 15, name: 'Video Scenes Genereren',     description: 'Het genereren van videos',                     executor: 'Elevate',          readyToUse: true },
  { stepNumber: 16, name: 'Director\'s Cut',            description: 'De video editing bepalen',                     executor: 'Claude Opus',      readyToUse: false },
  { stepNumber: 17, name: 'Achtergrondmuziek',          description: 'Het toevoegen van achtergrondmuziek',          executor: 'FFMPEG',           readyToUse: false },
  { stepNumber: 18, name: 'Color Grading',              description: 'Het toevoegen van color grading',              executor: 'FFMPEG',           readyToUse: true },
  { stepNumber: 19, name: 'Subtitles',                  description: 'Het toevoegen van ondertiteling',              executor: 'FFMPEG',           readyToUse: true },
  { stepNumber: 20, name: 'Overlay',                    description: 'Het toevoegen van overlay',                    executor: 'FFMPEG',           readyToUse: false },
  { stepNumber: 21, name: 'Sound Effects',              description: 'Het toevoegen van sound effects',              executor: 'FFMPEG',           readyToUse: true },
  { stepNumber: 22, name: 'Video Effects',              description: 'Het toevoegen van video effects',              executor: 'FFMPEG',           readyToUse: true },
  { stepNumber: 23, name: 'Final Export',               description: 'Het exporteren van de video',                  executor: 'FFMPEG',           readyToUse: true },
  { stepNumber: 24, name: 'Thumbnail',                  description: 'Het maken van de thumbnail',                   executor: 'App',              readyToUse: false },
  { stepNumber: 25, name: 'Drive Upload',               description: 'Het uploaden van het pakket in drive',         executor: 'App',              readyToUse: true },
];

// Mapping v3 → v4 (voor migratie referentie)
// v3 stap 0-5 → v4 stap 0-5 (ongewijzigd)
// v3 stap 6 (Script) → v4 stap 7 (Script) — stap 6 is nu Script Orchestrator
// v3 stap 7-24 → v4 stap 8-25 (allemaal +1)
