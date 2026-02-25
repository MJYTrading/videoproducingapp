export interface OutputFormat {
  id: string;
  name: string;
  resolution: string;
  aspectRatio: string;
}

export const OUTPUT_FORMATS: OutputFormat[] = [
  { id: 'youtube-1080p', name: 'YouTube 1080p', resolution: '1920x1080', aspectRatio: '16:9' },
  { id: 'youtube-4k', name: 'YouTube 4K', resolution: '3840x2160', aspectRatio: '16:9' },
  { id: 'shorts', name: 'Shorts (9:16)', resolution: '1080x1920', aspectRatio: '9:16' },
];
