import { useEffect, useMemo } from 'react'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { HUMAN_REVIEW, KIND, NODE_KIND, humanize } from '../theme'

const NODE_W = 200
const NODE_H = 70

function StepNode({ data }) {
  const k = KIND[data.kind]
  return (
    <div
      style={{ width: NODE_W }}
      className={`rounded-xl border bg-slate-900/95 px-3 py-2.5 shadow-lg transition-all duration-300 ${k.border} ${
        data.onPath ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-950' : ''
      } ${data.dimmed ? 'opacity-25' : ''} ${data.clickable ? 'cursor-pointer hover:bg-slate-800' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-slate-600" />
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${k.chip}`}>
          {k.label}
        </span>
        {data.count > 0 && (
          <span className="rounded-full bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-200">
            {data.count}
          </span>
        )}
      </div>
      <p className="mt-1.5 truncate text-[13px] font-medium text-slate-100" title={data.label}>
        {data.label}
      </p>
      {data.threshold != null && (
        <p className="mt-0.5 text-[10px] text-violet-300/80">acts when ≥ {Math.round(data.threshold * 100)}% sure</p>
      )}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-slate-600" />
    </div>
  )
}

const nodeTypes = { step: StepNode }

function linksOf(node) {
  if (node.type === 'condition') return [{ to: node.if_true, label: 'yes' }, { to: node.if_false, label: 'no' }]
  if (node.type === 'decide') return Object.entries(node.routes).map(([opt, to]) => ({ to, label: humanize(opt) }))
  if (node.type === 'write') return [{ to: node.next, label: '' }]
  return []
}

function buildGraph(workflow, { path, nodeCounts, edgeCounts, thresholds }) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 80 })
  g.setDefaultEdgeLabel(() => ({}))

  const steps = [...workflow.nodes]
  const hasJev = steps.some((n) => n.type === 'decide')
  if (hasJev && !steps.some((n) => n.id === HUMAN_REVIEW)) {
    steps.push({ id: HUMAN_REVIEW, type: 'outcome', label: 'Human review', outcome: HUMAN_REVIEW })
  }
  steps.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }))

  const onPath = new Set(path || [])
  const takenEdge = (a, b) => path && path.some((id, i) => id === a && path[i + 1] === b)
  const maxCount = Math.max(1, ...Object.values(edgeCounts))
  const edges = []

  const addEdge = (source, target, label, review) => {
    g.setEdge(source, target)
    const count = edgeCounts[`${source}>${target}`] || 0
    const taken = takenEdge(source, target)
    const colour = review ? KIND.human.hex : taken ? '#38bdf8' : count ? '#64748b' : '#334155'
    edges.push({
      id: `${source}>${target}>${label}`,
      source,
      target,
      label: count ? `${label ? `${label} · ` : ''}${count}` : label,
      animated: taken || (count > 0 && !path),
      style: {
        stroke: colour,
        strokeWidth: taken ? 3 : 1.2 + (count / maxCount) * 3.5,
        strokeDasharray: review ? '6 5' : undefined,
        opacity: path && !taken ? 0.35 : 1,
      },
      labelStyle: { fontSize: 11, fill: review ? '#fcd34d' : '#cbd5e1', fontWeight: 500 },
      labelBgStyle: { fill: '#0f172a', fillOpacity: 0.9 },
      labelBgPadding: [5, 3],
      labelBgBorderRadius: 4,
    })
  }

  workflow.nodes.forEach((n) => {
    linksOf(n).forEach((link) => addEdge(n.id, link.to, link.label, false))
    // any Jev step can hand the item to a person when it isn't sure enough
    if (n.type === 'decide') addEdge(n.id, HUMAN_REVIEW, 'unsure', true)
  })

  dagre.layout(g)
  const nodes = steps.map((n) => {
    const { x, y } = g.node(n.id)
    return {
      id: n.id,
      type: 'step',
      position: { x: x - NODE_W / 2, y: y - NODE_H / 2 },
      data: {
        kind: n.id === HUMAN_REVIEW || n.outcome === HUMAN_REVIEW ? 'human' : NODE_KIND[n.type],
        label: n.label,
        count: nodeCounts[n.id] || 0,
        threshold: n.type === 'decide' ? thresholds[n.id] : null,
        onPath: onPath.has(n.id),
        dimmed: path ? !onPath.has(n.id) : false,
        clickable: n.type === 'decide',
      },
    }
  })
  return { nodes, edges }
}

export default function WorkflowCanvas({ workflow, path, nodeCounts, edgeCounts, thresholds, onSelectStep }) {
  const graph = useMemo(
    () => buildGraph(workflow, { path, nodeCounts, edgeCounts, thresholds }),
    [workflow, path, nodeCounts, edgeCounts, thresholds],
  )
  // React Flow v12 keeps nodes hidden until it has measured them, and reports the
  // measurements through onNodesChange - so it owns the node state and each new
  // layout (counts, highlighted path) is pushed into it, keeping those measurements.
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)
  useEffect(() => {
    setNodes((current) => {
      const measured = Object.fromEntries(current.map((n) => [n.id, n.measured]))
      return graph.nodes.map((n) => ({ ...n, measured: measured[n.id] }))
    })
    setEdges(graph.edges)
  }, [graph, setNodes, setEdges])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      colorMode="dark"
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.3}
      nodesDraggable={false}
      nodesConnectable={false}
      onNodeClick={(_, node) => onSelectStep?.(node.id)}
    >
      <Background gap={22} size={1.2} color="#1e293b" />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
