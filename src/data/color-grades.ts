export interface ColorGrade {
  id: string;
  name: string;
  description: string;
}

export const COLOR_GRADES: ColorGrade[] = [
  { id: 'none', name: 'Geen', description: 'Geen filter' },
  { id: 'cinematic_dark', name: 'Cinematic Dark', description: 'Donker, contrastrijk — crime, thriller' },
  { id: 'history_warm', name: 'History Warm', description: 'Warme sepia tonen — historisch' },
  { id: 'vibrant', name: 'Vibrant', description: 'Heldere kleuren — upbeat, travel' },
  { id: 'clean_neutral', name: 'Clean Neutral', description: 'Minimale grading — animatie' },
  { id: 'cold_blue', name: 'Cold Blue', description: 'Koude blauwe tint — tech, sci-fi' },
  { id: 'noir', name: 'Noir', description: 'Bijna zwart-wit — zware crime' },
];
