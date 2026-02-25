export interface Voice {
  id: string;
  name: string;
  description: string;
  language: string;
  default?: boolean;
}

export const VOICES: Voice[] = [
  { id: '2pwMUCWPsm9t6AwXYaCj', name: 'Dave', description: 'Australian Male', language: 'en-AU' },
  { id: '15CVCzDByBinCIoCblXo', name: 'Lucan Rook', description: 'Energetic Male', language: 'en-US' },
  { id: 'yl2ZDV1MzN4HbQJbMihG', name: 'Alex', description: 'Young American Male', language: 'en-US' },
  { id: 'Fahco4VZzobUeiPqni1S', name: 'Archer', description: 'Conversational', language: 'en-US' },
  { id: 'od84OdVweqzO3t6kKlWT', name: 'Pete', description: 'UK Radio Host', language: 'en-GB' },
  { id: 'HqW11As4VRPkApNPkAZp', name: 'Scott', description: 'Young Canadian Male', language: 'en-CA' },
  { id: 'uJgAp2HcS4msGNrkrmbb', name: 'Ali', description: 'Arabic American', language: 'en-US' },
  { id: 'TbEd6wZh117FdOyTGS3q', name: 'Brody', description: 'Crime Narrator', language: 'en-US', default: true },
  { id: 'Dslrhjl3ZpzrctukrQSN', name: 'Brad', description: 'Documentary', language: 'en-US' },
  { id: 'tFNXkg45n3yC6nHvEn2s', name: 'Jay', description: 'African American', language: 'en-US' },
];
