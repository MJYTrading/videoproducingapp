/**
 * PipelineCanvas — React Flow canvas met custom nodes
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Node, type Edge, type Connection, type OnConnect,
  BackgroundVariant, MarkerType, Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Plus, CheckCircle2, AlertTriangle, AlertCircle, Maximize, List,
  Save, RotateCcw, Trash2, Copy, Download, RefreshCw,
} from 'lucide-react';
import PipelineFlowNode from './PipelineFlowNode';
import NodeDetailPanel from './NodeDetailPanel';
import StepCatalog from './StepCatalog';
import { apiJson, type PipelineData, type PipelineNodeData, type ValidationResult } from './types';

const nodeTypes = { pipelineNode: PipelineFlowNode };

interface Props {
  pipelineId: number;
}

export default function PipelineCanvas({ pipelineId }: Props) {
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [models, setModels] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const positionSaveTimeout = useRef<any>(null);

  // Load pipeline data
  const loadPipeline = useCallback(async () => {
    try {
      const [p, m, t] = await Promise.all([
        apiJson(`/pipelines/${pipelineId}`),
        apiJson('/llm-models'),
        apiJson('/api-tools'),
      ]);
      setPipeline(p);
      setModels(m);
      setTools(t);
      buildFlowData(p);
      // Also validate
      const v = await apiJson(`/pipelines/${pipelineId}/validate`);
      setValidation(v);
    } catch (err) { console.error('Pipeline laden mislukt:', err); }
    setLoading(false);
  }, [pipelineId]);

  useEffect(() => { loadPipeline(); }, [loadPipeline]);

  // Build React Flow nodes & edges from pipeline data
  const buildFlowData = (p: PipelineData) => {
    // Build validation map
    const nodeValidation: Record<number, { errors: string[]; warnings: string[] }> = {};

    const flowNodes: Node[] = p.nodes.map(n => {
      const v = nodeValidation[n.id] || { errors: [], warnings: [] };
      return {
        id: String(n.id),
        type: 'pipelineNode',
        position: { x: n.positionX, y: n.positionY },
        data: {
          label: n.stepDefinition.name,
          stepDefinition: n.stepDefinition,
          nodeData: n,
          validation: v,
        },
      };
    });

    const flowEdges: Edge[] = p.connections.map(c => ({
      id: `e-${c.id}`,
      source: String(c.sourceNodeId),
      sourceHandle: c.sourceOutputKey,
      target: String(c.targetNodeId),
      targetHandle: c.targetInputKey,
      type: 'smoothstep',
      animated: false,
      style: { stroke: 'rgba(134, 239, 172, 0.3)', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(134, 239, 172, 0.4)', width: 12, height: 12 },
      data: { connectionId: c.id },
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  // Handle new connection drawn
  const onConnect: OnConnect = useCallback(async (connection: Connection) => {
    if (!pipeline || !connection.source || !connection.target) return;
    try {
      const conn = await apiJson(`/pipelines/${pipelineId}/connections`, {
        method: 'POST',
        body: JSON.stringify({
          sourceNodeId: parseInt(connection.source),
          sourceOutputKey: connection.sourceHandle || '',
          targetNodeId: parseInt(connection.target),
          targetInputKey: connection.targetHandle || '',
        }),
      });

      setEdges(eds => addEdge({
        ...connection,
        id: `e-${conn.id}`,
        type: 'smoothstep',
        style: { stroke: 'rgba(134, 239, 172, 0.3)', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(134, 239, 172, 0.4)', width: 12, height: 12 },
        data: { connectionId: conn.id },
      }, eds));

      // Re-validate
      loadPipeline();
    } catch (err: any) { console.error('Verbinding mislukt:', err); }
  }, [pipeline, pipelineId]);

  // Handle edge deletion
  const onEdgesDelete = useCallback(async (deletedEdges: Edge[]) => {
    for (const edge of deletedEdges) {
      const connId = edge.data?.connectionId;
      if (connId) {
        try { await apiJson(`/pipelines/${pipelineId}/connections/${connId}`, { method: 'DELETE' }); }
        catch (err) { console.error('Delete mislukt:', err); }
      }
    }
    loadPipeline();
  }, [pipelineId]);

  // Handle node position changes (debounced save)
  const onNodeDragStop = useCallback((_: any, node: Node) => {
    if (positionSaveTimeout.current) clearTimeout(positionSaveTimeout.current);
    positionSaveTimeout.current = setTimeout(async () => {
      // Collect all current positions
      const positions = nodes.map(n => ({
        id: parseInt(n.id),
        x: n.position.x,
        y: n.position.y,
      }));
      try { await apiJson(`/pipelines/${pipelineId}/nodes/positions`, { method: 'POST', body: JSON.stringify({ positions }) }); }
      catch (err) { console.error('Posities opslaan mislukt:', err); }
    }, 500);
  }, [nodes, pipelineId]);

  // Node click handler
  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(parseInt(node.id));
  }, []);

  // Add node from catalog
  const addNode = useCallback(async (stepDefId: number, x: number, y: number) => {
    try {
      await apiJson(`/pipelines/${pipelineId}/nodes`, {
        method: 'POST',
        body: JSON.stringify({ stepDefinitionId: stepDefId, positionX: x, positionY: y }),
      });
      loadPipeline();
    } catch (err: any) { alert('Node toevoegen mislukt: ' + err.message); }
  }, [pipelineId]);

  // Get selected node data
  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !pipeline) return null;
    return pipeline.nodes.find(n => n.id === selectedNodeId) || null;
  }, [selectedNodeId, pipeline]);

  // Stats
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
      {/* Catalog sidebar */}
      {showCatalog && (
        <StepCatalog
          onAdd={addNode}
          existingStepDefIds={pipeline.nodes.map(n => n.stepDefinitionId)}
          onClose={() => setShowCatalog(false)}
        />
      )}

      {/* Canvas */}
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
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.03)" />
          <Controls className="!bg-surface-100 !border-white/10 !rounded-xl !shadow-lg [&>button]:!bg-surface-200 [&>button]:!border-white/10 [&>button]:!text-zinc-400 [&>button:hover]:!bg-surface-300" />
          <MiniMap
            className="!bg-surface-100/80 !border-white/10 !rounded-xl"
            nodeColor={(node) => {
              const cat = node.data?.stepDefinition?.category;
              const colors: Record<string, string> = { research: '#3b82f6', script: '#a855f7', audio: '#f59e0b', visual: '#10b981', post: '#ef4444', output: '#06b6d4' };
              return colors[cat] || '#71717a';
            }}
            maskColor="rgba(0,0,0,0.6)"
          />

          {/* Top toolbar */}
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

          {/* Action buttons */}
          <Panel position="top-right" className="flex items-center gap-1.5">
            <button onClick={() => setShowCatalog(!showCatalog)} className="glass rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white transition">
              <Plus className="w-3.5 h-3.5" /> Stap
            </button>
            <button onClick={loadPipeline} className="glass rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white transition">
              <RotateCcw className="w-3.5 h-3.5" /> Refresh
            </button>
          </Panel>

          {/* Validation panel */}
          {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
            <Panel position="bottom-left" className="max-w-[400px]">
              <div className="glass rounded-xl p-3 space-y-1.5">
                {validation.errors.map((e, i) => (
                  <div key={`e-${i}`} className="flex items-start gap-1.5 text-[10px]">
                    <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                    <span className="text-red-300"><b>{e.nodeName}:</b> {e.message}</span>
                  </div>
                ))}
                {validation.warnings.map((w, i) => (
                  <div key={`w-${i}`} className="flex items-start gap-1.5 text-[10px]">
                    <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-amber-300"><b>{w.nodeName}:</b> {w.message}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <NodeDetailPanel
          node={selectedNode}
          allNodes={pipeline.nodes}
          pipelineId={pipelineId}
          onClose={() => setSelectedNodeId(null)}
          onSave={loadPipeline}
          models={models}
          tools={tools}
        />
      )}
    </div>
  );
}
