export interface SubStyle {
  id: string;
  name: string;
  description: string;
  icon: string;
  allowsRealImages: boolean;
  defaultColorGrade: string;
  comingSoon?: boolean;
}

export interface Style {
  id: string;
  name: string;
  description: string;
  icon: string;
  subStyles?: SubStyle[];
  allowsRealImages?: boolean;
  defaultColorGrade?: string;
  comingSoon?: boolean;
}

export const VIDEO_STYLES: Style[] = [
  {
    id: 'trending',
    name: 'Trending',
    description: 'Virale video stijl met snelle cuts en hooks',
    icon: '🔥',
    allowsRealImages: true,
    defaultColorGrade: 'vibrant',
  },
  {
    id: 'documentary',
    name: 'Documentary',
    description: 'Professionele documentaire stijl',
    icon: '🎞️',
    allowsRealImages: true,
    defaultColorGrade: 'cinematic_dark',
  },
  {
    id: 'compilation',
    name: 'Compilatie',
    description: 'Compilatie video met meerdere bronnen',
    icon: '🎬',
    allowsRealImages: true,
    defaultColorGrade: 'clean_neutral',
  },
  {
    id: 'ai',
    name: 'AI Gegenereerd',
    description: 'Volledig door AI gegenereerde visuals',
    icon: '🤖',
    subStyles: [
      {
        id: 'ai-3d-render',
        name: '3D Render',
        description: 'Fotorealistische 3D scenes met mannequin figuren',
        icon: '🧊',
        allowsRealImages: false,
        defaultColorGrade: 'cinematic_dark',
      },
      {
        id: 'ai-2d-animation',
        name: '2D Animatie',
        description: 'Getekende animatie stijl',
        icon: '✏️',
        allowsRealImages: false,
        defaultColorGrade: 'clean_neutral',
      },
      {
        id: 'ai-history',
        name: 'History',
        description: 'Historische reconstructies met AI',
        icon: '🏛️',
        allowsRealImages: true,
        defaultColorGrade: 'history_warm',
      },
      {
        id: 'ai-realistic',
        name: 'Realistisch',
        description: 'Realistische AI-gegenereerde beelden',
        icon: '📷',
        allowsRealImages: true,
        defaultColorGrade: 'vibrant',
      },
      {
        id: 'ai-stickman',
        name: 'Stickman',
        description: 'Simpele stickman animaties',
        icon: '🕴️',
        allowsRealImages: false,
        defaultColorGrade: 'clean_neutral',
      },
    ],
  },
  {
    id: 'listicle',
    name: 'Listicle',
    description: 'Lijst-gebaseerde video (Top 10, etc.)',
    icon: '📝',
    allowsRealImages: true,
    defaultColorGrade: 'vibrant',
  },
];
