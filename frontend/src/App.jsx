import { useCallback, useEffect, useMemo, useState } from 'react'
import { compileWorkflow, getDatasets, runWorkflow } from './api'
import { HUMAN_REVIEW, KIND, pathOf } from './theme'
import Glyph from './components/Glyph'
import InboxPanel from './components/InboxPanel'
import ProcessPanel from './components/ProcessPanel'
import Scoreboard from './components/Scoreboard'
import StepInspector from './components/StepInspector'
import WorkflowCanvas from './components/WorkflowCanvas'

// same defaults as the backend (models.DEFAULT_MIN_CONFIDENCE)
const DEFAULT_THRESHOLD = { choice: 0.35, yes_no: 0.4 }

const thresholdsOf = (wf) =>
  Object.fromEntries(
    wf.nodes.filter((n) => n.type === 'decide').map((n) => [n.id, n.min_confidence ?? DEFAULT_THRESHOLD[n.kind]]),
  )

function Legend() {
  return (
    <ul className="hidden items-center gap-4 xl:flex">
      {['code', 'jev', 'llm', 'human'].map((kind) => (
        <li key={kind} className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <Glyph kind={kind} className={KIND[kind].text} />
          <span className="font-medium text-ink">{KIND[kind].label}</span>
          <span>{KIND[kind].sub}</span>
        </li>
      ))}
    </ul>
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

  const resetRun = () => {
    setResults({})
    setSummary(null)
    setSelectedItem(null)
  }

  // open an inbox on its saved reference workflow, so there is something to run straight away
  const openDataset = useCallback((dataset) => {
    const wf = dataset.reference_workflow
    setWorkflow(wf)
    setThresholds(wf ? thresholdsOf(wf) : {})
    setLog(wf ? [{ stage: 'loaded' }] : [])
    setBuildId((id) => id + 1)
  }, [])

  useEffect(() => {
    getDatasets()
      .then((list) => {
        setDatasets(list)
        setDescriptions(Object.fromEntries(list.map((d) => [d.id, d.template])))
        const first = list.find((d) => d.id === 'accounts_payable') || list[0]
        if (first) openDataset(first)
      })
      .catch((e) => setError(`Couldn't load the sample inboxes: ${e.message}`))
  }, [openDataset])

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

  // how many inbox items went through each step and edge
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

  const switchDataset = (id) => {
    if (id === datasetId || building || running) return
    setDatasetId(id)
    setSelectedStep(null)
    resetRun()
    openDataset(datasets.find((d) => d.id === id))
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
        setLog((prev) => [...prev.map((e) => ({ ...e, pending: false })), { ...event, pending: event.stage === 'drafting' }])
        if (event.stage === 'done') {
          setWorkflow(event.result.workflow)
          setThresholds(thresholdsOf(event.result.workflow))
          setBuildId((id) => id + 1)
        }
      })
    } catch (e) {
      setError(`The build didn't finish: ${e.message}`)
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
        else {
          setSummary(event)
          if (event.jev_errors) {
            setError(
              `Jev couldn't be reached for ${event.jev_errors} of ${event.items} items, so they went to a person. Try again in a moment.`,
            )
          }
        }
      })
    } catch (e) {
      setError(`The run stopped: ${e.message}`)
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
      setError(`Your test didn't run: ${e.message}`)
    } finally {
      setRunning(false)
    }
  }

  const selectedResult = selectedItem ? results[selectedItem] : null
  const inspected = selectedStep && nodeMap[selectedStep]?.type === 'decide' ? nodeMap[selectedStep] : null

  return (
    <div className="flex h-full flex-col bg-paper text-ink">
      <header className="flex items-center gap-8 border-b border-rule bg-sheet px-5">
        <div className="py-3">
          <h1 className="font-cond text-[19px] font-semibold leading-none tracking-[-0.01em]">Routing Slip</h1>
          <p className="mt-1 text-[12px] text-ink-2">A process in plain words, run on a real inbox</p>
        </div>

        <nav aria-label="Sample inboxes" className="flex self-stretch">
          {datasets.map((d) => (
            <button
              key={d.id}
              onClick={() => switchDataset(d.id)}
              title={d.blurb}
              aria-current={d.id === datasetId ? 'page' : undefined}
              className={`border-b-2 px-3 text-[13.5px] transition-colors ${
                d.id === datasetId ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink'
              }`}
            >
              {d.name.replace(' inbox', '')}
            </button>
          ))}
        </nav>

        <div className="ml-auto">
          <Legend />
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-center justify-between border-b border-rule bg-human-soft px-5 py-2 text-[13px] text-ink">
          {error}
          <button className="text-[12px] text-ink-2 hover:text-ink" onClick={() => setError(null)}>Dismiss</button>
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

          <main className="flex min-w-0 flex-1 flex-col">
            <Scoreboard summary={summary} total={dataset.items.length} />
            <div className="relative min-h-0 flex-1">
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
                <div className="flex h-full items-center justify-center px-8">
                  <p className="max-w-sm text-center text-[14px] leading-relaxed text-ink-2">
                    {building
                      ? 'The LLM is drafting your workflow. Each draft is checked before it appears here.'
                      : 'Build a workflow to see it here.'}
                  </p>
                </div>
              )}

              {runnable && !inspected && (
                <p className="pointer-events-none absolute bottom-3 left-14 text-[12px] text-ink-3">
                  Click a Jev step to see its question and set how sure it must be.
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
            </div>
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
        !error && <p className="p-8 text-[14px] text-ink-2">Loading the sample inboxes…</p>
      )}
    </div>
  )
}
