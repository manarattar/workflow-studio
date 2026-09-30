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
import Glyph from './Glyph'
import { HUMAN_REVIEW, KIND, NODE_KIND, humanize } from '../theme'

const NODE_W = 196
const NODE_H = 76

function StepNode({ data }) {
  const k = KIND[data.kind]
  const review = data.kind === 'human'
  return (
    <div
      style={{ width: NODE_W }}
      className={`rounded-[3px] border bg-sheet px-3 py-2 transition-[opacity,box-shadow] duration-200 ${
        review ? 'border-dashed border-human' : data.diff === 'added' ? 'border-2 border-done' : data.diff === 'changed' ? 'border-2 border-human' : 'border-rule'
      } ${data.onPath ? 'shadow-[0_0_0_2px_var(--ink)]' : 'shadow-[0_1px_2px_rgba(20,30,40,0.06)]'} ${
        data.dimmed ? 'opacity-30' : ''
      } ${data.clickable ? 'cursor-pointer hover:border-ink-2' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-ink-3" />
      <div className={`flex items-center gap-1.5 font-cond text-[11px] font-semibold uppercase tracking-[0.07em] ${k.text}`}>
        <Glyph kind={data.kind} />
        <span>{k.label}</span>
        {data.diff && (
          <span className={`ml-auto rounded-[2px] px-1 text-[10px] tracking-[0.06em] ${data.diff === 'added' ? 'bg-done-soft text-done' : 'bg-human-soft text-human'}`}>
            {data.diff === 'added' ? 'NEW' : 'CHANGED'}
          </span>
        )}
        {data.count > 0 && <span className="num ml-auto text-[11px] font-medium tracking-normal text-ink-2">{data.count}</span>}
      </div>
      <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink" title={data.label}>
        {data.label}
      </p>
      {data.threshold != null && (
        <p className="mt-0.5 text-[11px] text-ink-3">
          acts at <span className="num">{Math.round(data.threshold * 100)}%</span> sure or more
        </p>
      )}
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-ink-3" />
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

function buildGraph(workflow, { path, nodeCounts, edgeCounts, thresholds, diff }) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 78 })
  g.setDefaultEdgeLabel(() => ({}))

  const steps = [...workflow.nodes]
  if (steps.some((n) => n.type === 'decide') && !steps.some((n) => n.id === HUMAN_REVIEW)) {
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
    edges.push({
      id: `${source}>${target}>${label}`,
      source,
      target,
      label: count ? `${label ? `${label}  ` : ''}${count}` : label,
      style: {
        stroke: review ? 'var(--human)' : taken || count ? 'var(--ink-2)' : 'var(--ink-3)',
        strokeWidth: taken ? 2.6 : 1 + (count / maxCount) * 3,
        strokeDasharray: review ? '5 4' : undefined,
        opacity: path && !taken ? 0.3 : 1,
      },
      labelStyle: {
        fontSize: 11,
        fill: review ? 'var(--human)' : 'var(--ink-2)',
        fontFamily: 'var(--font-mono)',
      },
      labelBgStyle: { fill: 'var(--paper)' },
      labelBgPadding: [4, 2],
    })
  }

  workflow.nodes.forEach((n) => {
    linksOf(n).forEach((link) => addEdge(n.id, link.to, link.label, false))
    // any Jev step hands the item to a person when it isn't sure enough
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
        clickable: n.id !== HUMAN_REVIEW,
        diff: diff?.[n.id],
      },
    }
  })
  return { nodes, edges }
}

export default function WorkflowCanvas({ workflow, path, nodeCounts, edgeCounts, thresholds, diff, onSelectStep }) {
  const graph = useMemo(
    () => buildGraph(workflow, { path, nodeCounts, edgeCounts, thresholds, diff }),
    [workflow, path, nodeCounts, edgeCounts, thresholds, diff],
  )
  // React Flow v12 keeps nodes hidden until it has measured them and reports the
  // measurements through onNodesChange, so it owns the node state; each new layout
  // (counts, highlighted path) is pushed in while keeping those measurements.
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
      colorMode="system"
      fitView
      fitViewOptions={{ padding: 0.16 }}
      minZoom={0.3}
      nodesDraggable={false}
      nodesConnectable={false}
      onNodeClick={(_, node) => onSelectStep?.(node.id)}
    >
      <Background gap={24} size={1.4} color="var(--grid)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
