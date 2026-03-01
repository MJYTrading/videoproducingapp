/**
 * PipelineCanvas v3.1 — met auto-layout en dynamische data
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Node, type Edge, type Connection, type OnConnect,
  BackgroundVariant, MarkerType, Panel, useReactFlow, ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Plus, AlertTriangle, AlertCircle, AlignHorizontalSpaceAround,
  RotateCcw, RefreshCw,
} from 'lucide-react';
import PipelineFlowNode from './PipelineFlowNode';
import NodeDetailPanel from './NodeDetailPanel';
import StepCatalog from './StepCatalog';
import { apiJson, type PipelineData, type PipelineNodeData, type ValidationResult } from './types';

const nodeTypes = { pipelineNode: PipelineFlowNode };

interface Props {
  pipelineId: number;
}

function PipelineCanvasInner({ pipelineId }: Props) {
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
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

  // Load pipeline + reference data
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

  // Load voices, styles, colorGrades (static JSON files)
  useEffect(() => {
    fetch('/voices.json').then(r => r.json()).then(setVoices).catch(() => {});
    fetch('/styles.json').then(r => r.json()).then(setStyles).catch(() => {});
    fetch('/color-grades.json').then(r => r.json()).then(setColorGrades).catch(() => {});
  }, []);

  useEffect(() => { loadPipeline(); }, [loadPipeline]);

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
      style: { stroke: 'rgba(134, 239, 172, 0.3)', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(134, 239, 172, 0.4)', width: 12, height: 12 },
      data: { connectionId: c.id },
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  // New connection
  const onConnect: OnConnect = useCallback(async (connection: Connection) => {
    if (!pipeline || !connection.source || !connection.target) return;
    // Find source output key and target input key from step definitions
    const sourceNode = pipeline.nodes.find(n => n.id === parseInt(connection.source!));
    const targetNode = pipeline.nodes.find(n => n.id === parseInt(connection.target!));
    if (!sourceNode || !targetNode) return;

    const sourceOutputs = sourceNode.stepDefinition.outputSchema || [];
    const targetInputs = (targetNode.stepDefinition.inputSchema || []).filter((i: any) => i.source !== 'project');
    const sourceKey = sourceOutputs[0]?.key || 'output';
    const targetKey = targetInputs[0]?.key || 'input';

    try {
      const conn = await apiJson('/pipelines/' + pipelineId + '/connections', {
        method: 'POST',
        body: JSON.stringify({
          sourceNodeId: parseInt(connection.source!),
          sourceOutputKey: sourceKey,
          targetNodeId: parseInt(connection.target!),
          targetInputKey: targetKey,
        }),
      });
      setEdges(eds => addEdge({
        ...connection,
        id: 'e-' + conn.id,
        type: 'smoothstep',
        style: { stroke: 'rgba(134, 239, 172, 0.3)', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(134, 239, 172, 0.4)', width: 12, height: 12 },
        data: { connectionId: conn.id },
      }, eds));
      loadPipeline();
    } catch (err: any) { console.error('Verbinding mislukt:', err); }
  }, [pipeline, pipelineId]);

  // Delete edges
  const onEdgesDelete = useCallback(async (deletedEdges: Edge[]) => {
    for (const edge of deletedEdges) {
      const connId = edge.data?.connectionId;
      if (connId) {
        try { await apiJson('/pipelines/' + pipelineId + '/connections/' + connId, { method: 'DELETE' }); }
        catch (err) { console.error('Delete mislukt:', err); }
      }
    }
    loadPipeline();
  }, [pipelineId]);

  // Save positions after drag
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
  }, []);

  const addNode = useCallback(async (stepDefId: number, x: number, y: number) => {
    try {
      await apiJson('/pipelines/' + pipelineId + '/nodes', {
        method: 'POST',
        body: JSON.stringify({ stepDefinitionId: stepDefId, positionX: x, positionY: y }),
      });
      loadPipeline();
    } catch (err: any) { alert('Node toevoegen mislukt: ' + err.message); }
  }, [pipelineId]);

  // ═══════════════════════════════════════════════
  // AUTO-LAYOUT — topologische sortering + lagen
  // ═══════════════════════════════════════════════
  const autoLayout = useCallback(async () => {
    if (!pipeline) return;

    const nodeList = pipeline.nodes;
    const connections = pipeline.connections;

    // Build adjacency + in-degree
    const adj: Record<number, number[]> = {};
    const inDeg: Record<number, number> = {};
    const allIds = nodeList.map(n => n.id);
    for (const id of allIds) { adj[id] = []; inDeg[id] = 0; }
    for (const c of connections) {
      if (adj[c.sourceNodeId]) adj[c.sourceNodeId].push(c.targetNodeId);
      if (inDeg[c.targetNodeId] !== undefined) inDeg[c.targetNodeId]++;
    }

    // Topological sort into layers (BFS Kahn's algorithm)
    const layers: number[][] = [];
    let queue = allIds.filter(id => inDeg[id] === 0);

    while (queue.length > 0) {
      layers.push([...queue]);
      const nextQueue: number[] = [];
      for (const nodeId of queue) {
        for (const neighbor of (adj[nodeId] || [])) {
          inDeg[neighbor]--;
          if (inDeg[neighbor] === 0) nextQueue.push(neighbor);
        }
      }
      queue = nextQueue;
    }

    // Orphan nodes (not in any layer due to cycles)
    const placed = new Set(layers.flat());
    const orphans = allIds.filter(id => !placed.has(id));
    if (orphans.length > 0) layers.push(orphans);

    // Position calculation
    const NODE_W = 240;
    const NODE_H = 120;
    const GAP_X = 80;
    const GAP_Y = 40;
    const START_X = 50;
    const START_Y = 50;

    const positions: { id: number; x: number; y: number }[] = [];

    for (let col = 0; col < layers.length; col++) {
      const layer = layers[col];
      const x = START_X + col * (NODE_W + GAP_X);
      const totalHeight = layer.length * NODE_H + (layer.length - 1) * GAP_Y;
      const startY = START_Y + Math.max(0, (3 * NODE_H - totalHeight) / 2); // Center vertically

      for (let row = 0; row < layer.length; row++) {
        const y = startY + row * (NODE_H + GAP_Y);
        positions.push({ id: layer[row], x, y });
      }
    }

    // Update nodes on canvas
    setNodes(prev => prev.map(n => {
      const pos = positions.find(p => p.id === parseInt(n.id));
      return pos ? { ...n, position: { x: pos.x, y: pos.y } } : n;
    }));

    // Save to backend
    try {
      await apiJson('/pipelines/' + pipelineId + '/nodes/positions', {
        method: 'POST',
        body: JSON.stringify({ positions }),
      });
    } catch (err) { console.error('Auto-layout opslaan mislukt:', err); }

    // Fit view after layout
    setTimeout(() => fitView({ padding: 0.15 }), 100);
  }, [pipeline, pipelineId, setNodes, fitView]);

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
          onEdgesDelete={onEdgesDelete}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelectedNodeId(null)}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          deleteKeyCode="Delete"
          snapToGrid
          snapGrid={[10, 10]}
          minZoom={0.15}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.03)" />
          <Controls className="!bg-surface-100 !border-white/10 !rounded-xl !shadow-lg [&>button]:!bg-surface-200 [&>button]:!border-white/10 [&>button]:!text-zinc-400 [&>button:hover]:!bg-surface-300" />
          <MiniMap
            className="!bg-surface-100/80 !border-white/10 !rounded-xl"
            nodeColor={(node) => {
              const cat = node.data?.stepDefinition?.category;
              const colors: Record<string, string> = { setup: '#71717a', research: '#3b82f6', script: '#a855f7', audio: '#f59e0b', visual: '#10b981', post: '#ef4444', output: '#06b6d4' };
              return colors[cat] || '#71717a';
            }}
            maskColor="rgba(0,0,0,0.6)"
          />

          {/* Info bar */}
          <Panel position="top-left" className="flex items-center gap-2">
            <div className="glass rounded-xl px-4 py-2 flex items-center gap-3">
              <h2 className="text-sm font-bold text-white">{pipeline.name}</h2>
              <div className="h-4 w-px bg-white/10" />
              <span className="text-[10px] text-zinc-400">{stats.nodes} nodes</span>
              <span className="text-[10px] text-zinc-400">{stats.connections} conn</span>
              <span className="text-[10px] text-emerald-400">{stats.ready} ready</span>
              {stats.skeleton > 0 && <span className="text-[10px] text-amber-400">{stats.skeleton} skeleton</span>}
            </div>
          </Panel>

          {/* Toolbar */}
          <Panel position="top-right" className="flex items-center gap-1.5">
            <button onClick={() => setShowCatalog(!showCatalog)} className="glass rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white transition">
              <Plus className="w-3.5 h-3.5" /> Stap
            </button>
            <button onClick={autoLayout} className="glass rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white transition" title="Auto-layout: nodes netjes uitlijnen">
              <AlignHorizontalSpaceAround className="w-3.5 h-3.5" /> Layout
            </button>
            <button onClick={loadPipeline} className="glass rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white transition">
              <RotateCcw className="w-3.5 h-3.5" /> Refresh
            </button>
          </Panel>

          {/* Validation */}
          {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
            <Panel position="bottom-left" className="max-w-[400px]">
              <div className="glass rounded-xl p-3 space-y-1.5 max-h-[200px] overflow-auto">
                {validation.errors.map((e, i) => (
                  <div key={'e-' + i} className="flex items-start gap-1.5 text-[10px]">
                    <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                    <span className="text-red-300"><b>{e.nodeName}:</b> {e.message}</span>
                  </div>
                ))}
                {validation.warnings.map((w, i) => (
                  <div key={'w-' + i} className="flex items-start gap-1.5 text-[10px]">
                    <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-amber-300"><b>{w.nodeName}:</b> {w.message}</span>
                  </div>
                ))}
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

// Wrap in ReactFlowProvider for useReactFlow hook
export default function PipelineCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <PipelineCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
