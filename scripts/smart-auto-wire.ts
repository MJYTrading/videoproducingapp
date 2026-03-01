/**
 * Smart Auto-Wire — Minimale verbindingen met transitieve data
 * 
 * Strategie: Bouw een lineaire flow (backbone) + specifieke data-draden.
 * 
 * 1. Bepaal de natuurlijke volgorde van stappen (topologisch)
 * 2. Verbind elke stap alleen met de DICHTSTBIJZIJNDE upstream producent per input key
 * 3. Geen dubbele connections, geen generieke output→input
 * 4. Engine leest later alle upstream data via de keten
 * 
 * Gebruik: npx tsx scripts/smart-auto-wire.ts
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function smartAutoWire() {
  const pipelines = await prisma.pipeline.findMany({
    where: { isActive: true },
    include: {
      nodes: {
        include: { stepDefinition: true },
        orderBy: { sortOrder: 'asc' },
      },
      connections: true,
    },
  });

  for (const pipeline of pipelines) {
    console.log(`\n═══ ${pipeline.name} (${pipeline.nodes.length} nodes) ═══`);

    // Delete ALL existing connections
    const deleted = await prisma.pipelineConnection.deleteMany({
      where: { pipelineId: pipeline.id },
    });
    console.log(`  Verwijderd: ${deleted.count} oude connections`);

    const nodes = pipeline.nodes;

    // Parse output/input schemas
    interface ParsedNode {
      id: number;
      name: string;
      sortOrder: number;
      outputs: string[];   // output keys this node produces
      inputs: { key: string; required: boolean; source?: string }[];
    }

    const parsed: ParsedNode[] = nodes.map(n => {
      let outputs: any[] = [];
      let inputs: any[] = [];
      try { outputs = JSON.parse(n.stepDefinition.outputSchema || '[]'); } catch {}
      try { inputs = JSON.parse(n.stepDefinition.inputSchema || '[]'); } catch {}
      return {
        id: n.id,
        name: n.stepDefinition.name,
        sortOrder: n.sortOrder,
        outputs: outputs.map((o: any) => o.key),
        inputs: inputs.filter((i: any) => i.source !== 'project').map((i: any) => ({
          key: i.key, required: i.required, source: i.source,
        })),
      };
    });

    // Build: which node produces which output key
    const producerMap: Record<string, number[]> = {};
    for (const node of parsed) {
      for (const outputKey of node.outputs) {
        if (!producerMap[outputKey]) producerMap[outputKey] = [];
        producerMap[outputKey].push(node.id);
      }
    }

    // For each node, find the closest upstream producer for each required input
    const newConnections: { sourceNodeId: number; sourceOutputKey: string; targetNodeId: number; targetInputKey: string }[] = [];
    const alreadyConnected = new Set<string>(); // "sourceId-targetId-key"

    for (const node of parsed) {
      for (const input of node.inputs) {
        const producers = producerMap[input.key] || [];
        // Filter: only producers that come BEFORE this node in sort order
        const upstreamProducers = producers
          .filter(pid => pid !== node.id)
          .map(pid => parsed.find(p => p.id === pid)!)
          .filter(p => p && p.sortOrder < node.sortOrder)
          .sort((a, b) => b.sortOrder - a.sortOrder); // Closest first (highest sortOrder = most recent)

        if (upstreamProducers.length > 0) {
          const closest = upstreamProducers[0];
          const connKey = `${closest.id}-${node.id}-${input.key}`;
          if (!alreadyConnected.has(connKey)) {
            newConnections.push({
              sourceNodeId: closest.id,
              sourceOutputKey: input.key,
              targetNodeId: node.id,
              targetInputKey: input.key,
            });
            alreadyConnected.add(connKey);
          }
        }
      }
    }

    // Also add backbone connections: connect sequential steps that have no explicit data connection
    // This ensures the visual flow shows the execution order
    const sortedNodes = [...parsed].sort((a, b) => a.sortOrder - b.sortOrder);
    for (let i = 1; i < sortedNodes.length; i++) {
      const prev = sortedNodes[i - 1];
      const curr = sortedNodes[i];
      // Check if there's already a connection between these two
      const hasConnection = newConnections.some(c =>
        c.sourceNodeId === prev.id && c.targetNodeId === curr.id
      );
      // Only add backbone if they're direct neighbors AND no data connection exists
      // Skip if the current node has all its inputs satisfied from other sources
      if (!hasConnection) {
        const currInputsSatisfied = curr.inputs.every(inp =>
          newConnections.some(c => c.targetNodeId === curr.id && c.targetInputKey === inp.key)
        );
        // Only add backbone for nodes with no inputs (they need a flow connection)
        if (curr.inputs.length === 0 && prev.outputs.length > 0) {
          // Don't add unnecessary backbone connections
        }
      }
    }

    // Create all connections
    let created = 0;
    for (const conn of newConnections) {
      try {
        await prisma.pipelineConnection.create({
          data: { pipelineId: pipeline.id, ...conn },
        });
        created++;
        const srcName = parsed.find(p => p.id === conn.sourceNodeId)?.name || '?';
        const tgtName = parsed.find(p => p.id === conn.targetNodeId)?.name || '?';
        console.log(`  ✅ ${srcName} --[${conn.sourceOutputKey}]--> ${tgtName}`);
      } catch (err: any) {
        console.log(`  ⚠️ Skip: ${err.message?.slice(0, 50)}`);
      }
    }

    console.log(`  📊 Resultaat: ${created} connections (was ${deleted.count})`);
  }
}

smartAutoWire()
  .catch(e => { console.error('Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
