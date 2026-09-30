import { useEffect, useMemo, useState } from 'react'
import { compileWorkflow, getDatasets, runWorkflow } from './api'
import { HUMAN_REVIEW, KIND, pathOf } from './theme'
import InboxPanel from './components/InboxPanel'
import ProcessPanel from './components/ProcessPanel'
import Scoreboard from './components/Scoreboard'
import StepInspector from './components/StepInspector'
import WorkflowCanvas from './components/WorkflowCanvas'

// same defaults as the backend (models.DEFAULT_MIN_CONFIDENCE)
const DEFAULT_THRESHOLD = { choice: 0.35, yes_no: 0.4 }

function Legend() {
  return (
    <div className="hidden items-center gap-3 lg:flex">
      {['code', 'jev', 'llm', 'human'].map((kind) => (
        <span key={kind} className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className={`h-2 w-2 rounded-full ${KIND[kind].dot}`} />
          <span className="text-slate-200">{KIND[kind].label}</span>
          <span>{KIND[kind].sub}</span>
        </span>
      ))}
    </div>
  )
}

function EmptyCanvas({ building }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex w-fit items-center gap-2">
          {['code', 'jev', 'llm'].map((kind, i) => (
            <div key={kind} className="flex items-center gap-2">
              <div
                className={`rounded-lg border ${KIND[kind].border} bg-slate-900 px-3 py-2 text-xs ${KIND[kind].text} ${
                  building ? 'animate-pulse' : ''
                }`}
                style={{ animationDelay: `${i * 200}ms` }}
              >
                {KIND[kind].label}
              </div>
              {i < 2 && <span className="text-slate-600">→</span>}
            </div>
          ))}
        </div>
        <h2 className="text-lg font-semibold text-slate-100">
          {building ? 'Turning your words into a workflow…' : 'Your workflow appears here'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Each step goes to the tool that fits it: <span className="text-slate-200">code</span> for numbers and
          rules, <span className="text-violet-300">Jev</span> for judgment calls with a confidence score, and an{' '}
          <span className="text-cyan-300">LLM</span> only where something needs to be written. When Jev isn't sure,
          a person decides.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const [datasets, setDatasets] = useState([])
  const [datasetId, setDatasetId] = useState('accounts_payable')
  const [descriptions, setDescriptions] = useState({})
  const [error, setError] = useState(null)

  const [building, setBuilding] = useState(false)
  const [log, setLog] = useState([])
  const [workflow, setWorkflow] = useState(null)
  const [buildId, setBuildId] = useState(0) // remounts the canvas so each new workflow is fitted to view
  const [thresholds, setThresholds] = useState({})

  const [running, setRunning] = useState(false)
  const [results, setResults] = useState({})
  const [summary, setSummary] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedStep, setSelectedStep] = useState(null)

  useEffect(() => {
    getDatasets()
      .then((list) => {
        setDatasets(list)
        setDescriptions(Object.fromEntries(list.map((d) => [d.id, d.template])))
      })
      .catch((e) => setError(e.message))
  }, [])

  const dataset = datasets.find((d) => d.id === datasetId)
  const description = descriptions[datasetId] || ''
  const nodeMap = useMemo(() => Object.fromEntries((workflow?.nodes || []).map((n) => [n.id, n])), [workflow])

  // the workflow as it will run: the compiled one plus the thresholds set in the inspector
  const runnable = useMemo(() => {
    if (!workflow) return null
    return {
      ...workflow,
      nodes: workflow.nodes.map((n) => (n.type === 'decide' ? { ...n, min_confidence: thresholds[n.id] } : n)),
    }
  }, [workflow, thresholds])

  // how many inbox items went through each step and edge, for the canvas
  const { nodeCounts, edgeCounts } = useMemo(() => {
    const nodeCounts = {}
    const edgeCounts = {}
    Object.entries(results).forEach(([id, r]) => {
      if (id === 'custom') return
      const path = pathOf(r)
      path.forEach((node, i) => {
        nodeCounts[node] = (nodeCounts[node] || 0) + 1
        if (i > 0) edgeCounts[`${path[i - 1]}>${node}`] = (edgeCounts[`${path[i - 1]}>${node}`] || 0) + 1
      })
    })
    return { nodeCounts, edgeCounts }
  }, [results])

  const resetRun = () => {
    setResults({})
    setSummary(null)
    setSelectedItem(null)
  }

  const switchDataset = (id) => {
    if (id === datasetId || building || running) return
    setDatasetId(id)
    setWorkflow(null)
    setLog([])
    setSelectedStep(null)
    resetRun()
  }

  const build = async () => {
    setBuilding(true)
    setError(null)
    setWorkflow(null)
    setSelectedStep(null)
    setLog([])
    resetRun()
    try {
      await compileWorkflow(datasetId, description, (event) => {
        setLog((prev) => {
          const settled = prev.map((e) => ({ ...e, pending: false }))
          return [...settled, { ...event, pending: event.stage === 'drafting' }]
        })
        if (event.stage === 'done') {
          const wf = event.result.workflow
          setWorkflow(wf)
          setBuildId((id) => id + 1)
          setThresholds(
            Object.fromEntries(
              wf.nodes
                .filter((n) => n.type === 'decide')
                .map((n) => [n.id, n.min_confidence ?? DEFAULT_THRESHOLD[n.kind]]),
            ),
          )
        }
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setBuilding(false)
    }
  }

  const runInbox = async () => {
    setRunning(true)
    setError(null)
    resetRun()
    try {
      await runWorkflow({ datasetId, workflow: runnable }, (event) => {
        if (event.event === 'item') setResults((prev) => ({ ...prev, [event.item_id]: event }))
        else setSummary(event)
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  const runCustom = async (item) => {
    setRunning(true)
    setError(null)
    try {
      await runWorkflow({ datasetId, workflow: runnable, customItem: item }, (event) => {
        if (event.event === 'item') {
          setResults((prev) => ({ ...prev, custom: event }))
          setSelectedItem('custom')
        }
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  const selectedResult = selectedItem ? results[selectedItem] : null
  const inspected = selectedStep && nodeMap[selectedStep]?.type === 'decide' ? nodeMap[selectedStep] : null

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between gap-6 border-b border-slate-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 text-sm font-bold text-slate-950">
            W
          </div>
          <div>
            <h1 className="text-sm font-semibold">Workflow Studio</h1>
            <p className="text-[11px] text-slate-400">Plain words in, a working AI workflow out</p>
          </div>
        </div>

        <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
          {datasets.map((d) => (
            <button
              key={d.id}
              onClick={() => switchDataset(d.id)}
              title={d.blurb}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                d.id === datasetId ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>

        <Legend />
      </header>

      {error && (
        <div className="border-b border-rose-900 bg-rose-950/60 px-5 py-2 text-xs text-rose-200">
          {error}
          <button className="ml-3 text-rose-400 hover:underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      {dataset ? (
        <div className="flex min-h-0 flex-1">
          <ProcessPanel
            dataset={dataset}
            description={description}
            setDescription={(text) => setDescriptions((prev) => ({ ...prev, [datasetId]: text }))}
            onBuild={build}
            building={building}
            log={log}
          />

          <main className="relative min-w-0 flex-1">
            {runnable ? (
              <WorkflowCanvas
                key={`${datasetId}-${buildId}`}
                workflow={runnable}
                path={pathOf(selectedResult)}
                nodeCounts={nodeCounts}
                edgeCounts={edgeCounts}
                thresholds={thresholds}
                onSelectStep={(id) => setSelectedStep(id === HUMAN_REVIEW ? null : id)}
              />
            ) : (
              <EmptyCanvas building={building} />
            )}

            <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
              <Scoreboard summary={summary} />
            </div>

            {runnable && !inspected && !summary && (
              <p className="pointer-events-none absolute bottom-4 left-4 text-[11px] text-slate-500">
                Tip: click a Jev step to see its question and set how sure it must be.
              </p>
            )}

            {inspected && (
              <div className="pointer-events-none absolute bottom-4 left-4">
                <StepInspector
                  node={inspected}
                  threshold={thresholds[inspected.id]}
                  onThreshold={(v) => setThresholds((prev) => ({ ...prev, [inspected.id]: v }))}
                  onClose={() => setSelectedStep(null)}
                  onRerun={runInbox}
                  canRerun={!running}
                />
              </div>
            )}
          </main>

          <InboxPanel
            key={datasetId}
            dataset={dataset}
            results={results}
            running={running}
            selectedId={selectedItem}
            onSelect={setSelectedItem}
            nodeMap={nodeMap}
            canRun={!!runnable && !building}
            onRunInbox={runInbox}
            onRunCustom={runCustom}
          />
        </div>
      ) : (
        !error && <p className="p-8 text-sm text-slate-500">Loading…</p>
      )}
    </div>
  )
}
