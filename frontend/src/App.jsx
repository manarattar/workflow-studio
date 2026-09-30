import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compileWorkflow, getDatasets, runWorkflow, validateWorkflow } from './api'
import {
  asDataset, deleteProject, exportProject, importProject, loadProjects, saveProject, specOf,
} from './projects'
import { HUMAN_REVIEW, KIND, pathOf } from './theme'
import ConnectPanel from './components/ConnectPanel'
import Glyph from './components/Glyph'
import InboxPanel from './components/InboxPanel'
import NewProject from './components/NewProject'
import ProcessPanel from './components/ProcessPanel'
import Scoreboard from './components/Scoreboard'
import StepEditor from './components/StepEditor'
import WorkflowCanvas from './components/WorkflowCanvas'

// same defaults as the backend (models.DEFAULT_MIN_CONFIDENCE)
const DEFAULT_THRESHOLD = { choice: 0.35, yes_no: 0.4 }

const thresholdsOf = (wf, saved = {}) =>
  Object.fromEntries(
    wf.nodes
      .filter((n) => n.type === 'decide')
      .map((n) => [n.id, saved[n.id] ?? n.min_confidence ?? DEFAULT_THRESHOLD[n.kind]]),
  )

const withThresholds = (wf, thresholds) =>
  wf && {
    ...wf,
    nodes: wf.nodes.map((n) => (n.type === 'decide' ? { ...n, min_confidence: thresholds[n.id] } : n)),
  }

function Legend() {
  return (
    <ul className="hidden items-center gap-4 2xl:flex">
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

function ProjectsMenu({ projects, onOpen, onNew, onImport }) {
  const [open, setOpen] = useState(false)
  const file = useRef(null)
  return (
    <div className="relative self-stretch">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="h-full border-b-2 border-transparent px-3 text-[13.5px] text-ink-2 hover:text-ink"
      >
        Your projects ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 w-64 rounded-[3px] border border-rule bg-sheet py-1 shadow-[0_8px_24px_rgba(20,30,40,0.12)]">
          {projects.length === 0 && (
            <p className="px-3 py-2 text-[12.5px] text-ink-3">No projects yet. They are kept in this browser.</p>
          )}
          {projects.map((p) => (
            <button key={p.id} onClick={() => { setOpen(false); onOpen(p.id) }}
              className="block w-full truncate px-3 py-1.5 text-left text-[13px] text-ink hover:bg-paper">
              {p.name}
              {p.published && <span className="ml-1.5 text-[11px] text-done">live</span>}
            </button>
          ))}
          <div className="my-1 border-t border-rule" />
          <button onClick={() => { setOpen(false); onNew() }} className="block w-full px-3 py-1.5 text-left text-[13px] font-medium text-ink hover:bg-paper">
            New project
          </button>
          <button onClick={() => file.current?.click()} className="block w-full px-3 py-1.5 text-left text-[13px] text-ink hover:bg-paper">
            Import a project file
          </button>
          <input ref={file} id="import-file" type="file" accept=".json,application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setOpen(false); onImport(f) } }} />
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [datasets, setDatasets] = useState([])
  const [projects, setProjects] = useState(loadProjects)
  const [current, setCurrent] = useState({ kind: 'sample', id: 'accounts_payable' })
  const [descriptions, setDescriptions] = useState({})
  const [error, setError] = useState(null)
  const [showNew, setShowNew] = useState(false)

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

  const project = current.kind === 'project' ? projects.find((p) => p.id === current.id) : null
  const dataset = project ? asDataset(project) : datasets.find((d) => d.id === current.id)
  const source = project ? { project: specOf(project) } : { datasetId: current.id }
  const description = project ? project.description || '' : descriptions[current.id] || ''

  /** Save a change to the open project (this browser only). */
  const patchProject = useCallback((patch) => {
    if (current.kind !== 'project') return
    const existing = loadProjects().find((p) => p.id === current.id)
    if (!existing) return
    saveProject({ ...existing, ...patch })
    setProjects(loadProjects())
  }, [current])

  const resetRun = () => {
    setResults({})
    setSummary(null)
    setSelectedItem(null)
  }

  const showWorkflow = (wf, savedThresholds, logEntries) => {
    setWorkflow(wf)
    setThresholds(wf ? thresholdsOf(wf, savedThresholds) : {})
    setLog(logEntries)
    setBuildId((id) => id + 1)
  }

  useEffect(() => {
    getDatasets()
      .then((list) => {
        setDatasets(list)
        setDescriptions(Object.fromEntries(list.map((d) => [d.id, d.template])))
        const first = list.find((d) => d.id === 'accounts_payable') || list[0]
        if (first) showWorkflow(first.reference_workflow, {}, first.reference_workflow ? [{ stage: 'loaded' }] : [])
      })
      .catch((e) => setError(`Couldn't load the sample inboxes: ${e.message}`))
  }, [])

  const open = (next) => {
    if (building || running) return
    setCurrent(next)
    setSelectedStep(null)
    resetRun()
    if (next.kind === 'sample') {
      const d = datasets.find((x) => x.id === next.id)
      showWorkflow(d?.reference_workflow, {}, d?.reference_workflow ? [{ stage: 'loaded' }] : [])
    } else {
      const p = loadProjects().find((x) => x.id === next.id)
      showWorkflow(p?.workflow || null, p?.thresholds || {}, [])
    }
  }

  const nodeMap = useMemo(() => Object.fromEntries((workflow?.nodes || []).map((n) => [n.id, n])), [workflow])
  const runnable = useMemo(() => withThresholds(workflow, thresholds), [workflow, thresholds])

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

  const setDescription = (text) => {
    if (project) patchProject({ description: text })
    else setDescriptions((prev) => ({ ...prev, [current.id]: text }))
  }

  const setThreshold = (nodeId, value) => {
    const next = { ...thresholds, [nodeId]: value }
    setThresholds(next)
    patchProject({ thresholds: next })
  }

  const build = async () => {
    setBuilding(true)
    setError(null)
    setWorkflow(null)
    setSelectedStep(null)
    setLog([])
    resetRun()
    try {
      await compileWorkflow(source, description, (event) => {
        setLog((prev) => [...prev.map((e) => ({ ...e, pending: false })), { ...event, pending: event.stage === 'drafting' }])
        if (event.stage === 'done') {
          const wf = event.result.workflow
          setWorkflow(wf)
          const t = thresholdsOf(wf)
          setThresholds(t)
          setBuildId((id) => id + 1)
          patchProject({ workflow: wf, thresholds: t })
        }
      })
    } catch (e) {
      setError(`The build didn't finish: ${e.message}`)
    } finally {
      setBuilding(false)
    }
  }

  const run = async (customItem) => {
    setRunning(true)
    setError(null)
    if (!customItem) resetRun()
    try {
      await runWorkflow(source, runnable, customItem, (event) => {
        if (event.event === 'item') {
          const id = customItem ? 'custom' : event.item_id
          setResults((prev) => ({ ...prev, [id]: event }))
          if (customItem) setSelectedItem('custom')
        } else if (!customItem) {
          setSummary(event)
          if (event.jev_errors) {
            setError(`Jev couldn't be reached for ${event.jev_errors} of ${event.items} items, so they went to a person. Try again in a moment.`)
          }
        }
      })
    } catch (e) {
      setError(customItem ? `Your test didn't run: ${e.message}` : `The run stopped: ${e.message}`)
    } finally {
      setRunning(false)
    }
  }

  /** Check an edited step with the server; keep it only if the workflow stays valid. */
  const applyStep = async (edited) => {
    const next = { ...workflow, nodes: workflow.nodes.map((n) => (n.id === edited.id ? edited : n)) }
    try {
      const { problems } = await validateWorkflow(source, withThresholds(next, thresholds))
      if (problems.length) return problems
    } catch (e) {
      return [e.message]
    }
    setWorkflow(next)
    patchProject({ workflow: next })
    return []
  }

  const checkSpec = async (p) => {
    const probe = { name: 'check', start: 'o', nodes: [{ type: 'outcome', id: 'o', label: 'o', outcome: Object.keys(p.outcomes)[0] }] }
    try {
      await validateWorkflow({ project: specOf(p) }, probe)
      return []
    } catch (e) {
      return e.message.split(' — ').slice(1).filter(Boolean).concat(e.message.includes(' — ') ? [] : [e.message])
    }
  }

  const createProject = (p) => {
    saveProject(p)
    setProjects(loadProjects())
    setShowNew(false)
    open({ kind: 'project', id: p.id })
  }

  const importFile = async (file) => {
    try {
      const p = await importProject(file)
      setProjects(loadProjects())
      open({ kind: 'project', id: p.id })
    } catch (e) {
      setError(`Couldn't import that file: ${e.message}`)
    }
  }

  const removeProject = () => {
    deleteProject(project.id)
    setProjects(loadProjects())
    open({ kind: 'sample', id: 'accounts_payable' })
  }

  const selectedResult = selectedItem ? results[selectedItem] : null
  const editing = selectedStep && nodeMap[selectedStep] ? nodeMap[selectedStep] : null

  return (
    <div className="flex h-full flex-col bg-paper text-ink">
      <header className="flex items-center gap-8 border-b border-rule bg-sheet px-5">
        <div className="py-3">
          <h1 className="font-cond text-[19px] font-semibold leading-none tracking-[-0.01em]">Routing Slip</h1>
          <p className="mt-1 text-[12px] text-ink-2">A process in plain words, run on a real inbox</p>
        </div>

        <nav aria-label="Inboxes" className="flex self-stretch">
          {datasets.map((d) => {
            const active = current.kind === 'sample' && current.id === d.id
            return (
              <button key={d.id} onClick={() => open({ kind: 'sample', id: d.id })} title={d.blurb}
                aria-current={active ? 'page' : undefined}
                className={`border-b-2 px-3 text-[13.5px] transition-colors ${active ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}>
                {d.name.replace(' inbox', '')}
              </button>
            )
          })}
          {project && (
            <span aria-current="page" className="flex max-w-[220px] items-center border-b-2 border-ink px-3 text-[13.5px] font-medium text-ink">
              <span className="truncate">{project.name}</span>
            </span>
          )}
          <ProjectsMenu projects={projects} onOpen={(id) => open({ kind: 'project', id })} onNew={() => setShowNew(true)} onImport={importFile} />
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
            setDescription={setDescription}
            onBuild={build}
            building={building}
            log={log}
            onExport={() => exportProject(loadProjects().find((p) => p.id === project.id))}
            onDelete={removeProject}
          >
            {project && (
              <ConnectPanel
                project={project}
                workflow={runnable}
                onPublished={(published) => patchProject({ published })}
              />
            )}
          </ProcessPanel>

          <main className="flex min-w-0 flex-1 flex-col">
            <Scoreboard summary={summary} total={dataset.items.length} custom={Boolean(project)} />
            <div className="relative min-h-0 flex-1">
              {runnable ? (
                <WorkflowCanvas
                  key={`${current.kind}-${current.id}-${buildId}`}
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
                      : project
                        ? 'Describe how items should be routed, then build the workflow.'
                        : 'Build a workflow to see it here.'}
                  </p>
                </div>
              )}

              {runnable && !editing && (
                <p className="pointer-events-none absolute bottom-3 left-14 text-[12px] text-ink-3">
                  Click any step to edit it.
                </p>
              )}

              {editing && (
                <div className="pointer-events-none absolute bottom-4 left-4">
                  <StepEditor
                    node={editing}
                    fields={dataset.fields}
                    threshold={thresholds[editing.id]}
                    onThreshold={(v) => setThreshold(editing.id, v)}
                    onApply={applyStep}
                    onClose={() => setSelectedStep(null)}
                    onRerun={() => run()}
                    canRerun={!running && dataset.items.length > 0}
                  />
                </div>
              )}
            </div>
          </main>

          <InboxPanel
            key={`${current.kind}-${current.id}`}
            dataset={dataset}
            results={results}
            running={running}
            selectedId={selectedItem}
            onSelect={setSelectedItem}
            nodeMap={nodeMap}
            canRun={!!runnable && !building}
            onRunInbox={() => run()}
            onRunCustom={(item) => run(item)}
            onAddExample={(item) => patchProject({ items: [...(project?.items || []), item] })}
          />
        </div>
      ) : (
        !error && <p className="p-8 text-[14px] text-ink-2">Loading…</p>
      )}

      {showNew && <NewProject onCreate={createProject} onCancel={() => setShowNew(false)} checkSpec={checkSpec} />}
    </div>
  )
}
