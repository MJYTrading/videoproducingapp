/**
 * PipelineCanvas v3.2 — Dagre layout, edge dimming, auto-wire, edge delete
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Node, type Edge, type Connection, type OnConnect, type EdgeMouseHandler,
  BackgroundVariant, MarkerType, Panel, useReactFlow, ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Plus, AlertTriangle, AlertCircle, AlignHorizontalSpaceAround,
  RotateCcw, RefreshCw, Trash2,
} from 'lucide-react';
import PipelineFlowNode from './PipelineFlowNode';
import NodeDetailPanel from './NodeDetailPanel';
import StepCatalog from './StepCatalog';
import { apiJson, type PipelineData, type PipelineNodeData, type ValidationResult } from './types';

const nodeTypes = { pipelineNode: PipelineFlowNode };

// Dagre-achtige layout (pure JS, geen extra dep nodig)
function computeDagreLayout(
  nodes: PipelineNodeData[],
  connections: { sourceNodeId: number; targetNodeId: number }[]
): Map<number, { x: number; y: number }> {
  const adj: Record<number, number[]> = {};
  const inDeg: Record<number, number> = {};
  const allIds = nodes.map(n => n.id);
  for (const id of allIds) { adj[id] = []; inDeg[id] = 0; }
  for (const c of connections) {
    if (adj[c.sourceNodeId]) adj[c.sourceNodeId].push(c.targetNodeId);
    if (inDeg[c.targetNodeId] !== undefined) inDeg[c.targetNodeId]++;
  }

  // Kahn's algorithm → layers
  const layers: number[][] = [];
  let queue = allIds.filter(id => inDeg[id] === 0);
  const placed = new Set<number>();

  while (queue.length > 0) {
    layers.push([...queue]);
    queue.forEach(id => placed.add(id));
    const next: number[] = [];
    for (const nodeId of queue) {
      for (const nb of (adj[nodeId] || [])) {
        inDeg[nb]--;
        if (inDeg[nb] === 0 && !placed.has(nb)) next.push(nb);
      }
    }
    queue = next;
  }

  // Orphans
  const orphans = allIds.filter(id => !placed.has(id));
  if (orphans.length > 0) layers.push(orphans);

  // Sort within layers: nodes with shared parents should be adjacent
  for (let i = 1; i < layers.length; i++) {
    const prevLayer = new Set(layers[i - 1]);
    layers[i].sort((a, b) => {
      const aParents = connections.filter(c => c.targetNodeId === a && prevLayer.has(c.sourceNodeId)).length;
      const bParents = connections.filter(c => c.targetNodeId === b && prevLayer.has(c.sourceNodeId)).length;
      return bParents - aParents;
    });
  }

  const COL_W = 280;
  const ROW_H = 100;
  const GAP_Y = 30;
  const START_X = 60;
  const START_Y = 60;

  const positions = new Map<number, { x: number; y: number }>();

  for (let col = 0; col < layers.length; col++) {
    const layer = layers[col];
    const totalH = layer.length * ROW_H + (layer.length - 1) * GAP_Y;
    // Center vertically relative to the tallest layer
    const maxLayerSize = Math.max(...layers.map(l => l.length));
    const maxH = maxLayerSize * ROW_H + (maxLayerSize - 1) * GAP_Y;
    const offsetY = START_Y + (maxH - totalH) / 2;

    for (let row = 0; row < layer.length; row++) {
      positions.set(layer[row], {
        x: START_X + col * COL_W,
        y: offsetY + row * (ROW_H + GAP_Y),
      });
    }
  }

  return positions;
}

interface Props {
  pipelineId: number;
}

function PipelineCanvasInner({ pipelineId }: Props) {
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [models, setModels] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [voices, setVoices] = useState<any[]>([]);
  const [styles, setStyles] = useState<any[]>([]);
  const [colorGrades, setColorGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const positionSaveTimeout = useRef<any>(null);
  const { fitView } = useReactFlow();

  const loadPipeline = useCallback(async () => {
    try {
      const [p, m, t, v] = await Promise.all([
        apiJson('/pipelines/' + pipelineId),
        apiJson('/llm-models'),
        apiJson('/api-tools'),
        apiJson('/pipelines/' + pipelineId + '/validate'),
      ]);
      setPipeline(p);
      setModels(m);
      setTools(t);
      setValidation(v);
      buildFlowData(p);
    } catch (err) { console.error('Pipeline laden mislukt:', err); }
    setLoading(false);
  }, [pipelineId]);

  useEffect(() => {
    fetch('/voices.json').then(r => r.json()).then(setVoices).catch(() => {});
    fetch('/styles.json').then(r => r.json()).then(setStyles).catch(() => {});
    fetch('/color-grades.json').then(r => r.json()).then(setColorGrades).catch(() => {});
  }, []);

  useEffect(() => { loadPipeline(); }, [loadPipeline]);

  // Build flow data — edges are dimmed unless connected to selected node
  const buildFlowData = (p: PipelineData) => {
    const flowNodes: Node[] = p.nodes.map(n => ({
      id: String(n.id),
      type: 'pipelineNode',
      position: { x: n.positionX, y: n.positionY },
      data: {
        label: n.stepDefinition.name,
        stepDefinition: n.stepDefinition,
        nodeData: n,
        validation: { errors: [], warnings: [] },
      },
    }));

    const flowEdges: Edge[] = p.connections.map(c => ({
      id: 'e-' + c.id,
      source: String(c.sourceNodeId),
      sourceHandle: 'output',
      target: String(c.targetNodeId),
      targetHandle: 'input',
      type: 'smoothstep',
      animated: false,
      style: { stroke: 'rgba(134, 239, 172, 0.15)', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(134, 239, 172, 0.2)', width: 10, height: 10 },
      data: { connectionId: c.id },
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  // Update edge styles when a node is selected (highlight connected edges)
  useEffect(() => {
    if (!pipeline) return;
    setEdges(eds => eds.map(e => {
      const connId = e.data?.connectionId;
      const conn = pipeline.connections.find(c => c.id === connId);
      const isSelected = e.id === selectedEdgeId;
      const isConnected = selectedNodeId && conn && (conn.sourceNodeId === selectedNodeId || conn.targetNodeId === selectedNodeId);

      if (isSelected) {
        return { ...e, style: { stroke: '#ef4444', strokeWidth: 3 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444', width: 12, height: 12 }, animated: true };
      }
      if (isConnected) {
        return { ...e, style: { stroke: 'rgba(134, 239, 172, 0.6)', strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(134, 239, 172, 0.6)', width: 12, height: 12 }, animated: false };
      }
      if (selectedNodeId) {
        return { ...e, style: { stroke: 'rgba(134, 239, 172, 0.06)', strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(134, 239, 172, 0.06)', width: 8, height: 8 }, animated: false };
      }
      return { ...e, style: { stroke: 'rgba(134, 239, 172, 0.15)', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(134, 239, 172, 0.2)', width: 10, height: 10 }, animated: false };
    }));
  }, [selectedNodeId, selectedEdgeId, pipeline]);

  // New connection
  const onConnect: OnConnect = useCallback(async (connection: Connection) => {
    if (!pipeline || !connection.source || !connection.target) return;
    const sourceNode = pipeline.nodes.find(n => n.id === parseInt(connection.source!));
    const targetNode = pipeline.nodes.find(n => n.id === parseInt(connection.target!));
    if (!sourceNode || !targetNode) return;

    const sourceOutputs = sourceNode.stepDefinition.outputSchema || [];
    const targetInputs = (targetNode.stepDefinition.inputSchema || []).filter((i: any) => i.source !== 'project');
    const sourceKey = sourceOutputs[0]?.key || 'output';
    const targetKey = targetInputs[0]?.key || 'input';

    try {
      await apiJson('/pipelines/' + pipelineId + '/connections', {
        method: 'POST',
        body: JSON.stringify({ sourceNodeId: parseInt(connection.source!), sourceOutputKey: sourceKey, targetNodeId: parseInt(connection.target!), targetInputKey: targetKey }),
      });
      loadPipeline();
    } catch (err: any) { console.error('Verbinding mislukt:', err); }
  }, [pipeline, pipelineId]);

  // Click on edge → select it (show delete option)
  const onEdgeClick: EdgeMouseHandler = useCallback((_event, edge) => {
    setSelectedEdgeId(prev => prev === edge.id ? null : edge.id);
    setSelectedNodeId(null);
  }, []);

  // Delete selected edge
  const deleteSelectedEdge = useCallback(async () => {
    if (!selectedEdgeId) return;
    const edge = edges.find(e => e.id === selectedEdgeId);
    const connId = edge?.data?.connectionId;
    if (!connId) return;
    try {
      await apiJson('/pipelines/' + pipelineId + '/connections/' + connId, { method: 'DELETE' });
      setSelectedEdgeId(null);
      loadPipeline();
    } catch (err: any) { console.error('Verwijderen mislukt:', err); }
  }, [selectedEdgeId, edges, pipelineId]);

  // Keyboard: Delete/Backspace to remove selected edge
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) {
        e.preventDefault();
        deleteSelectedEdge();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedEdgeId, deleteSelectedEdge]);

  // Save positions
  const onNodeDragStop = useCallback(() => {
    if (positionSaveTimeout.current) clearTimeout(positionSaveTimeout.current);
    positionSaveTimeout.current = setTimeout(async () => {
      const positions = nodes.map(n => ({ id: parseInt(n.id), x: n.position.x, y: n.position.y }));
      try { await apiJson('/pipelines/' + pipelineId + '/nodes/positions', { method: 'POST', body: JSON.stringify({ positions }) }); }
      catch (err) { console.error('Posities opslaan mislukt:', err); }
    }, 500);
  }, [nodes, pipelineId]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(parseInt(node.id));
    setSelectedEdgeId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  // Add node with AUTO-WIRE
  const addNode = useCallback(async (stepDefId: number, x: number, y: number) => {
    if (!pipeline) return;
    try {
      // Create node
      const newNode = await apiJson('/pipelines/' + pipelineId + '/nodes', {
        method: 'POST',
        body: JSON.stringify({ stepDefinitionId: stepDefId, positionX: x, positionY: y }),
      });

      // Fetch the step definition to get input/output schema
      const allDefs = await apiJson('/step-definitions');
      const newDef = allDefs.find((d: any) => d.id === stepDefId);
      if (!newDef) { loadPipeline(); return; }

      const newInputs = (newDef.inputSchema || []).filter((i: any) => i.source !== 'project');

      // Auto-wire: for each required input, find an existing node that produces matching output
      for (const input of newInputs) {
        for (const existingNode of pipeline.nodes) {
          const existingOutputs = existingNode.stepDefinition.outputSchema || [];
          const matchingOutput = existingOutputs.find((o: any) => o.key === input.key);
          if (matchingOutput) {
            try {
              await apiJson('/pipelines/' + pipelineId + '/connections', {
                method: 'POST',
                body: JSON.stringify({
                  sourceNodeId: existingNode.id,
                  sourceOutputKey: matchingOutput.key,
                  targetNodeId: newNode.id,
                  targetInputKey: input.key,
                }),
              });
            } catch {} // Skip if duplicate
            break; // One source per input
          }
        }
      }

      loadPipeline();
    } catch (err: any) { alert('Node toevoegen mislukt: ' + err.message); }
  }, [pipelineId, pipeline]);

  // Auto-layout
  const autoLayout = useCallback(async () => {
    if (!pipeline) return;
    const positions = computeDagreLayout(pipeline.nodes, pipeline.connections);

    setNodes(prev => prev.map(n => {
      const pos = positions.get(parseInt(n.id));
      return pos ? { ...n, position: { x: pos.x, y: pos.y } } : n;
    }));

    const posArr = Array.from(positions.entries()).map(([id, pos]) => ({ id, x: pos.x, y: pos.y }));
    try { await apiJson('/pipelines/' + pipelineId + '/nodes/positions', { method: 'POST', body: JSON.stringify({ positions: posArr }) }); }
    catch (err) { console.error('Auto-layout opslaan mislukt:', err); }

    setTimeout(() => fitView({ padding: 0.12 }), 100);
  }, [pipeline, pipelineId, setNodes, fitView]);

  // Auto-wire ALL: re-connect all nodes based on matching keys
  const autoWireAll = useCallback(async () => {
    if (!pipeline) return;
    if (!confirm('Alle verbindingen opnieuw leggen op basis van matching input/output keys?')) return;

    // Delete all existing connections
    for (const conn of pipeline.connections) {
      try { await apiJson('/pipelines/' + pipelineId + '/connections/' + conn.id, { method: 'DELETE' }); } catch {}
    }

    // Re-wire based on matching keys
    let created = 0;
    for (const targetNode of pipeline.nodes) {
      const inputs = (targetNode.stepDefinition.inputSchema || []).filter((i: any) => i.source !== 'project');
      for (const input of inputs) {
        // Find first upstream node that produces this key
        for (const sourceNode of pipeline.nodes) {
          if (sourceNode.id === targetNode.id) continue;
          const outputs = sourceNode.stepDefinition.outputSchema || [];
          const match = outputs.find((o: any) => o.key === input.key);
          if (match) {
            try {
              await apiJson('/pipelines/' + pipelineId + '/connections', {
                method: 'POST',
                body: JSON.stringify({ sourceNodeId: sourceNode.id, sourceOutputKey: match.key, targetNodeId: targetNode.id, targetInputKey: input.key }),
              });
              created++;
            } catch {}
            break;
          }
        }
      }
    }

    alert(created + ' verbindingen aangemaakt');
    loadPipeline();
  }, [pipeline, pipelineId]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !pipeline) return null;
    return pipeline.nodes.find(n => n.id === selectedNodeId) || null;
  }, [selectedNodeId, pipeline]);

  const stats = useMemo(() => {
    if (!pipeline) return { nodes: 0, connections: 0, ready: 0, skeleton: 0 };
    return {
      nodes: pipeline.nodes.length,
      connections: pipeline.connections.length,
      ready: pipeline.nodes.filter(n => n.stepDefinition.isReady).length,
      skeleton: pipeline.nodes.filter(n => !n.stepDefinition.isReady).length,
    };
  }, [pipeline]);

  if (loading) return <div className="flex items-center justify-center h-full"><RefreshCw className="w-6 h-6 text-brand-400 animate-spin" /></div>;
  if (!pipeline) return <div className="text-center py-12 text-zinc-500">Pipeline niet gevonden</div>;

  return (
    <div className="flex h-full">
      {showCatalog && (
        <StepCatalog onAdd={addNode} existingStepDefIds={pipeline.nodes.map(n => n.stepDefinitionId)} onClose={() => setShowCatalog(false)} />
      )}

      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          snapToGrid
          snapGrid={[10, 10]}
          minZoom={0.1}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
          edgesReconnectable
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.03)" />
          <Controls className="!bg-surface-100 !border-white/10 !rounded-xl !shadow-lg [&>button]:!bg-surface-200 [&>button]:!border-white/10 [&>button]:!text-zinc-400 [&>button:hover]:!bg-surface-300" />
          <MiniMap
            className="!bg-surface-100/80 !border-white/10 !rounded-xl"
            nodeColor={(node) => {
              const cat = node.data?.stepDefinition?.category;
              const c: Record<string, string> = { setup: '#71717a', research: '#3b82f6', script: '#a855f7', audio: '#f59e0b', visual: '#10b981', post: '#ef4444', output: '#06b6d4' };
              return c[cat] || '#71717a';
            }}
            maskColor="rgba(0,0,0,0.6)"
          />

          {/* Info bar */}
          <Panel position="top-left">
            <div className="glass rounded-xl px-4 py-2 flex items-center gap-3">
              <h2 className="text-sm font-bold text-white">{pipeline.name}</h2>
              <div className="h-4 w-px bg-white/10" />
              <span className="text-[10px] text-zinc-400">{stats.nodes} nodes</span>
              <span className="text-[10px] text-zinc-400">{stats.connections} conn</span>
              {stats.skeleton > 0 && <span className="text-[10px] text-amber-400">{stats.skeleton} skeleton</span>}
            </div>
          </Panel>

          {/* Toolbar */}
          <Panel position="top-right" className="flex items-center gap-1.5">
            <button onClick={() => setShowCatalog(!showCatalog)} className="glass rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white transition">
              <Plus className="w-3.5 h-3.5" /> Stap
            </button>
            <button onClick={autoLayout} className="glass rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white transition" title="Auto-layout">
              <AlignHorizontalSpaceAround className="w-3.5 h-3.5" /> Layout
            </button>
            <button onClick={autoWireAll} className="glass rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white transition" title="Alle verbindingen opnieuw leggen">
              <RefreshCw className="w-3.5 h-3.5" /> Auto-wire
            </button>
            <button onClick={loadPipeline} className="glass rounded-lg px-2 py-1.5 text-xs text-zinc-400 hover:text-white transition">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </Panel>

          {/* Selected edge: delete button */}
          {selectedEdgeId && (
            <Panel position="bottom-center">
              <button onClick={deleteSelectedEdge} className="glass rounded-xl px-4 py-2 flex items-center gap-2 text-sm text-red-300 hover:text-red-200 transition">
                <Trash2 className="w-4 h-4" /> Verbinding verwijderen
              </button>
            </Panel>
          )}

          {/* Validation */}
          {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && !selectedNodeId && (
            <Panel position="bottom-left" className="max-w-[360px]">
              <div className="glass rounded-xl p-2.5 space-y-1 max-h-[150px] overflow-auto">
                {validation.errors.slice(0, 5).map((e, i) => (
                  <div key={'e-' + i} className="flex items-start gap-1.5 text-[9px]">
                    <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                    <span className="text-red-300">{e.nodeName}: {e.message}</span>
                  </div>
                ))}
                {validation.warnings.slice(0, 5).map((w, i) => (
                  <div key={'w-' + i} className="flex items-start gap-1.5 text-[9px]">
                    <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-amber-300">{w.nodeName}: {w.message}</span>
                  </div>
                ))}
                {(validation.errors.length + validation.warnings.length > 10) && (
                  <div className="text-[9px] text-zinc-500">+{validation.errors.length + validation.warnings.length - 10} meer...</div>
                )}
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {selectedNode && (
        <NodeDetailPanel
          node={selectedNode}
          allNodes={pipeline.nodes}
          pipelineId={pipelineId}
          onClose={() => setSelectedNodeId(null)}
          onSave={loadPipeline}
          models={models}
          tools={tools}
          voices={voices}
          styles={styles}
          colorGrades={colorGrades}
        />
      )}
    </div>
  );
}

export default function PipelineCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <PipelineCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
