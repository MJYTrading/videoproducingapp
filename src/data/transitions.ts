export interface Transition {
  id: string;
  name: string;
  icon: string;
}

export const TRANSITIONS: Transition[] = [
  { id: 'cross-dissolve', name: 'Cross Dissolve', icon: '↔️' },
  { id: 'fade-in', name: 'Fade In', icon: '⬛→' },
  { id: 'fade-out', name: 'Fade Out', icon: '→⬛' },
  { id: 'slide-left', name: 'Slide Left', icon: '◀️' },
  { id: 'zoom-in', name: 'Zoom In', icon: '🔍' },
  { id: 'wipe', name: 'Wipe', icon: '▶️' },
];
