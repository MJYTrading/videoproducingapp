export interface SubStyle {
  id: string;
  name: string;
  icon: string;
  description: string;
  allowsRealImages: boolean;
  defaultColorGrade?: string;
}

export interface Style {
  id: string;
  name: string;
  icon: string;
  description: string;
  subStyles?: SubStyle[];
  allowsRealImages?: boolean;
  defaultColorGrade?: string;
}

export const VIDEO_STYLES: Style[] = [
  {
    id: 'ai',
    name: 'AI Gegenereerd',
    icon: '🤖',
    description: 'Volledig AI-gegenereerde beelden en video scenes',
    subStyles: [
      {
        id: 'ai-3d-render',
        name: '3D Render',
        icon: '🧊',
        description: 'Fotorealistische 3D mannequins met Octane-stijl belichting',
        allowsRealImages: false,
        defaultColorGrade: 'cinematic_dark',
      },
      {
        id: 'ai-stickman',
        name: 'Stickman',
        icon: '🕴️',
        description: 'Speelse stickman animaties',
        allowsRealImages: false,
        defaultColorGrade: 'clean_neutral',
      },
      {
        id: 'ai-2d-animation',
        name: '2D Animatie',
        icon: '🎨',
        description: 'Cartoon-achtige 2D animatiestijl met dikke lijnen',
        allowsRealImages: false,
        defaultColorGrade: 'clean_neutral',
      },
    ],
  },
  {
    id: 'real',
    name: 'Real Footage',
    icon: '📷',
    description: 'Echte beelden, stock footage en historische foto\'s',
    subStyles: [
      {
        id: 'real-history',
        name: 'History',
        icon: '🏛️',
        description: 'Historische documentaire stijl met echte foto\'s',
        allowsRealImages: true,
        defaultColorGrade: 'history_warm',
      },
      {
        id: 'real-realistic',
        name: 'Realistisch',
        icon: '🎬',
        description: 'Realistische stijl met echte menselijke onderwerpen',
        allowsRealImages: true,
        defaultColorGrade: 'vibrant',
      },
    ],
  },
];
