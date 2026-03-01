/**
 * Fix Seed — Ontbrekende API tools toevoegen + Pexels verwijderen
 * Gebruik: npx tsx scripts/fix-api-tools.ts
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const MISSING_TOOLS = [
  { name: 'YouTube Transcript API', category: 'api', baseUrl: '', authType: 'api-key', authKeyRef: 'youtubeTranscriptApiKey', notes: 'YouTube transcript ophalen' },
  { name: 'GenAIPro', category: 'api', baseUrl: '', authType: 'bearer', authKeyRef: 'genaiProApiKey', notes: 'Video generatie — onbeperkt concurrent' },
  { name: 'NexLev', category: 'api', baseUrl: 'https://api.nexlev.io', authType: 'api-key', authKeyRef: 'nexlevApiKey', notes: 'YouTube analytics & kanaaldata' },
  { name: 'TwelveLabs', category: 'api', baseUrl: 'https://api.twelvelabs.io', authType: 'bearer', authKeyRef: 'twelveLabsApiKey', notes: 'Video analyse & zoeken' },
];

async function fix() {
  console.log('🔧 API Tools fixen...\n');

  // Ontbrekende tools toevoegen
  for (const tool of MISSING_TOOLS) {
    const existing = await prisma.apiTool.findFirst({ where: { name: tool.name } });
    if (existing) {
      console.log(`  ⏭ ${tool.name} (bestaat al)`);
    } else {
      await prisma.apiTool.create({ data: tool });
      console.log(`  ✅ ${tool.name} toegevoegd`);
    }
  }

  // Pexels verwijderen
  const pexels = await prisma.apiTool.findFirst({ where: { name: 'Pexels API' } });
  if (pexels) {
    await prisma.apiTool.delete({ where: { id: pexels.id } });
    console.log(`  🗑️ Pexels API verwijderd`);
  }

  // Overzicht
  const all = await prisma.apiTool.findMany({ orderBy: { id: 'asc' } });
  console.log(`\n📋 Huidige tools (${all.length}):`);
  for (const t of all) {
    console.log(`  ${t.id}. ${t.name} (${t.authType}) — ${t.notes}`);
  }
}

fix()
  .catch(e => { console.error('❌', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
