export interface SubStyle {
  id: string;
  name: string;
  icon: string;
  description: string;
  defaultColorGrade?: string;
}

export interface Style {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: 'real' | 'spokesperson' | 'ai';
  subStyles?: SubStyle[];
  defaultColorGrade?: string;
}

// Per stijl: welke stappen standaard AAN staan (true = toevoegen)
// Stappen 0-24
export const STYLE_STEP_DEFAULTS: Record<string, Record<number, boolean>> = {
  trending: {
    0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true,
    8: false, 9: true, 10: false, 11: true, 12: true, 13: false, 14: false,
    15: true, 16: true, 17: true, 18: true, 19: true, 20: true, 21: true,
    22: true, 23: true, 24: true,
  },
  documentary: {
    0: true, 1: true, 2: true, 3: true, 4: false, 5: true, 6: true, 7: true,
    8: false, 9: true, 10: false, 11: true, 12: true, 13: false, 14: false,
    15: true, 16: true, 17: true, 18: true, 19: true, 20: true, 21: true,
    22: true, 23: true, 24: true,
  },
  compilatie: {
    0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true,
    8: false, 9: true, 10: false, 11: true, 12: true, 13: false, 14: false,
    15: true, 16: true, 17: true, 18: true, 19: true, 20: true, 21: true,
    22: true, 23: true, 24: true,
  },
  'spokesperson-trending': {
    0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: false,
    8: true, 9: true, 10: false, 11: true, 12: true, 13: false, 14: false,
    15: true, 16: true, 17: true, 18: true, 19: true, 20: true, 21: true,
    22: true, 23: true, 24: true,
  },
  'spokesperson-ai': {
    0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: false,
    8: true, 9: true, 10: true, 11: false, 12: false, 13: true, 14: true,
    15: true, 16: true, 17: true, 18: true, 19: true, 20: true, 21: true,
    22: true, 23: true, 24: true,
  },
  ai: {
    0: true, 1: true, 2: true, 3: true, 4: false, 5: true, 6: true, 7: true,
    8: false, 9: true, 10: true, 11: false, 12: false, 13: true, 14: true,
    15: true, 16: true, 17: true, 18: true, 19: true, 20: true, 21: true,
    22: true, 23: true, 24: true,
  },
};

export const VIDEO_STYLES: Style[] = [
  {
    id: 'trending',
    name: 'Trending',
    icon: '🔥',
    description: 'Trending content met snelle cuts, stock footage en virale clips',
    category: 'real',
    defaultColorGrade: 'vibrant',
  },
  {
    id: 'documentary',
    name: 'Documentary',
    icon: '🎥',
    description: 'Documentaire stijl met echte beelden, interviews en archiefmateriaal',
    category: 'real',
    defaultColorGrade: 'cinematic_dark',
  },
  {
    id: 'compilatie',
    name: 'Compilatie',
    icon: '📼',
    description: 'Compilatie van clips, montages en stock footage',
    category: 'real',
    defaultColorGrade: 'clean_neutral',
  },
  {
    id: 'spokesperson-trending',
    name: 'Spokesperson Trending',
    icon: '🗣️',
    description: 'Nieuwsgerichte kanalen met echte personen in beeld en trending content',
    category: 'spokesperson',
    defaultColorGrade: 'vibrant',
  },
  {
    id: 'spokesperson-ai',
    name: 'Spokesperson AI',
    icon: '🧘',
    description: 'Spirituele/educatieve kanalen met echte personen en AI-gegenereerde achtergronden',
    category: 'spokesperson',
    defaultColorGrade: 'clean_neutral',
  },
  {
    id: 'ai',
    name: 'AI',
    icon: '🤖',
    description: 'Volledig AI-gegenereerde beelden en video scenes',
    category: 'ai',
    defaultColorGrade: 'cinematic_dark',
    subStyles: [
      { id: 'ai-3d-render', name: '3D Render', icon: '🧊', description: 'Fotorealistische 3D mannequins', defaultColorGrade: 'cinematic_dark' },
      { id: 'ai-stickman', name: 'Stickman', icon: '🕴️', description: 'Speelse stickman animaties', defaultColorGrade: 'clean_neutral' },
      { id: 'ai-2d-animation', name: '2D Animatie', icon: '🎨', description: 'Cartoon-achtige 2D animatiestijl', defaultColorGrade: 'clean_neutral' },
      { id: 'ai-history', name: 'History', icon: '🏛️', description: 'Historische documentaire stijl met AI beelden', defaultColorGrade: 'history_warm' },
      { id: 'ai-realistic', name: 'Realistisch', icon: '🎬', description: 'Realistische stijl met AI-gegenereerde onderwerpen', defaultColorGrade: 'vibrant' },
    ],
  },
];
