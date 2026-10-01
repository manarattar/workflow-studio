import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  askAboutWorkflow, compileWorkflow, getDatasets, reviseWorkflow, runWorkflow, validateWorkflow,
} from './api'
import {
  asDataset, deleteProject, exportProject, importProject, loadProjects, saveProject, specOf,
} from './projects'
import { HUMAN_REVIEW, KIND, pathOf } from './theme'
import ChatPanel from './components/ChatPanel'
import ConnectPanel from './components/ConnectPanel'
import Glyph from './components/Glyph'
import InboxPanel from './components/InboxPanel'
import NewProject from './components/NewProject'
import Onboarding, { hasSeenOnboarding } from './components/Onboarding'
import ThemeToggle from "./components/ThemeToggle.jsx";
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

const MAX_VERSIONS = 20

/** Steps that are new or changed in `next` compared with `prev`, plus labels of removed steps. */
function diffWorkflows(prev, next) {
  const strip = ({ min_confidence, ...n }) => n // eslint-disable-line no-unused-vars
  const before = Object.fromEntries(prev.nodes.map((n) => [n.id, JSON.stringify(strip(n))]))
  const after = new Set(next.nodes.map((n) => n.id))
  const diff = {}
  next.nodes.forEach((n) => {
    if (!(n.id in before)) diff[n.id] = 'added'
    else if (before[n.id] !== JSON.stringify(strip(n))) diff[n.id] = 'changed'
  })
  const removed = prev.nodes.filter((n) => !after.has(n.id)).map((n) => n.label)
  return { diff, removed }
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

function UseCaseMenu({ datasets, projects, current, project, onOpen, onNew, onImport }) {
  const [open, setOpen] = useState(false)
  const file = useRef(null)
  const wrap = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const sample = current.kind === 'sample' ? datasets.find((d) => d.id === current.id) : null
  const name = project ? project.name : sample ? sample.name : 'Choose a use case'
  const pick = (next) => { setOpen(false); onOpen(next) }
  const group = 'px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3'
  const row = 'block w-full px-3 py-2 text-left hover:bg-paper'

  return (
    <div ref={wrap} data-tour="projects" className="relative w-full lg:w-auto">
      <button
        data-tour="inboxes"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2 rounded-[3px] border border-rule bg-paper px-3 py-1.5 text-left hover:border-ink-3 lg:w-72"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] leading-none text-ink-3">Use case</span>
          <span className="mt-0.5 block truncate text-[13.5px] font-medium leading-tight text-ink">{name}</span>
        </span>
        <span aria-hidden className="text-[11px] text-ink-3">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 right-0 top-full z-40 mt-1 max-h-[70vh] overflow-y-auto rounded-[3px] border border-rule bg-sheet pb-1 shadow-[0_8px_24px_rgba(20,30,40,0.14)] lg:right-auto lg:w-96">
          <p className={group}>Sample inboxes</p>
          {datasets.map((d) => {
            const active = current.kind === 'sample' && current.id === d.id
            return (
              <button key={d.id} role="menuitem" onClick={() => pick({ kind: 'sample', id: d.id })} className={row}>
                <span className={`block text-[13.5px] ${active ? 'font-semibold text-ink' : 'text-ink'}`}>
                  {d.name.replace(' inbox', '')}{active && <span className="ml-1.5 text-[11px] font-normal text-ink-3">open</span>}
                </span>
                <span className="block text-[12px] leading-snug text-ink-3">{d.blurb}</span>
              </button>
            )
          })}
          <p className={`${group} mt-1 border-t border-rule`}>Your projects</p>
          {projects.length === 0 && (
            <p className="px-3 pb-2 text-[12.5px] text-ink-3">None yet. Projects are kept in this browser.</p>
          )}
          {projects.map((p) => (
            <button key={p.id} role="menuitem" onClick={() => pick({ kind: 'project', id: p.id })} className={`${row} truncate text-[13.5px] text-ink`}>
              {p.name}
              {p.published && <span className="ml-1.5 text-[11px] text-done">live</span>}
            </button>
          ))}
          <div className="mt-1 border-t border-rule pt-1">
            <button role="menuitem" onClick={() => { setOpen(false); onNew() }} className={`${row} text-[13.5px] font-medium text-ink`}>
              New project
            </button>
            <button role="menuitem" onClick={() => file.current?.click()} className={`${row} text-[13.5px] text-ink`}>
              Import a project file
            </button>
          </div>
          <input ref={file} id="import-file" type="file" accept=".json,application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setOpen(false); onImport(f) } }} />
        </div>
      )}
    </div>
  )
}

const VIEWS = [['process', 'Process'], ['workflow', 'Workflow'], ['inbox', 'Inbox']]

export default function App() {
  const [datasets, setDatasets] = useState([])
  const [projects, setProjects] = useState(loadProjects)
  const [current, setCurrent] = useState({ kind: 'sample', id: 'accounts_payable' })
  const [descriptions, setDescriptions] = useState({})
  const [error, setError] = useState(null)
  const [showNew, setShowNew] = useState(false)
  // first visit: a short tour instead of dropping people into the full studio
  const [showTour, setShowTour] = useState(() => !hasSeenOnboarding())

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

  const [leftTab, setLeftTab] = useState('process')
  const [view, setView] = useState('workflow') // which panel is on screen below the lg breakpoint
  const [messages, setMessages] = useState([])
  const [proposal, setProposal] = useState(null) // {workflow, diff, request} while waiting for accept/discard
  const [versions, setVersions] = useState([])
  const [pendingCompare, setPendingCompare] = useState(null) // {before, oldWorkflow} after accepting
  const [chatBusy, setChatBusy] = useState(false)

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
    setMessages([])
    setProposal(null)
    setPendingCompare(null)
    resetRun()
    if (next.kind === 'sample') {
      const d = datasets.find((x) => x.id === next.id)
      showWorkflow(d?.reference_workflow, {}, d?.reference_workflow ? [{ stage: 'loaded' }] : [])
    } else {
      const p = loadProjects().find((x) => x.id === next.id)
      showWorkflow(p?.workflow || null, p?.thresholds || {}, [])
    }
    setVersions(next.kind === 'project' ? loadProjects().find((x) => x.id === next.id)?.versions || [] : [])
  }

  const nodeMap = useMemo(() => Object.fromEntries((workflow?.nodes || []).map((n) => [n.id, n])), [workflow])
  const runnable = useMemo(() => withThresholds(workflow, thresholds), [workflow, thresholds])
  const selectedResult = selectedItem ? results[selectedItem] : null

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

  const run = async (customItem, onSummary) => {
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
          onSummary?.(event)
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

  const updateLast = (patch) =>
    setMessages((prev) => [...prev.slice(0, -1), { ...prev[prev.length - 1], ...patch }])

  const sendChat = async (text, mode) => {
    const about = mode === 'ask' && selectedResult ? selectedResult.title : null
    setMessages((prev) => [...prev, { role: 'user', mode, text, about }])
    setChatBusy(true)
    try {
      if (mode === 'ask') {
        const { answer } = await askAboutWorkflow(source, runnable, text, selectedResult, summary)
        setMessages((prev) => [...prev, { role: 'assistant', kind: 'answer', text: answer }])
        return
      }
      setMessages((prev) => [...prev, { role: 'assistant', kind: 'proposal', stage: 'working', attempt: 1 }])
      await reviseWorkflow(source, runnable, text, (event) => {
        if (event.stage === 'drafting') updateLast({ attempt: event.attempt })
        if (event.stage === 'failed') updateLast({ stage: 'failed', problems: event.problems })
        if (event.stage === 'done') {
          const { diff, removed } = diffWorkflows(workflow, event.result.workflow)
          if (!Object.keys(diff).length && !removed.length) {
            setMessages((prev) => [
              ...prev.slice(0, -1),
              { role: 'assistant', kind: 'answer', text: `No change was made. ${(event.result.changes || []).join(' ')}` },
            ])
            return
          }
          setProposal({ workflow: event.result.workflow, diff, request: text })
          setSelectedStep(null)
          updateLast({
            stage: 'done', status: 'pending', changes: event.result.changes || [], removed,
            repairs: (event.result.repairs || []).length,
          })
        }
      })
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', kind: 'error', text: e.message }])
    } finally {
      setChatBusy(false)
    }
  }

  const markProposal = (status) =>
    setMessages((prev) =>
      prev.map((m) => (m.kind === 'proposal' && m.status === 'pending' ? { ...m, status } : m)),
    )

  const keepVersion = (label) => {
    const next = [...versions, { at: Date.now(), label, workflow, thresholds }].slice(-MAX_VERSIONS)
    setVersions(next)
    return next
  }

  const acceptProposal = () => {
    const nextVersions = keepVersion(`Before: ${proposal.request}`)
    const t = thresholdsOf(proposal.workflow, thresholds)
    setPendingCompare({ before: summary, oldWorkflow: runnable })
    setWorkflow(proposal.workflow)
    setThresholds(t)
    setBuildId((id) => id + 1)
    patchProject({ workflow: proposal.workflow, thresholds: t, versions: nextVersions })
    setProposal(null)
    resetRun()
    markProposal('accepted')
    setMessages((prev) => [...prev, { role: 'assistant', kind: 'accepted', canCompare: dataset.items.length > 0 }])
  }

  const discardProposal = () => {
    setProposal(null)
    markProposal('discarded')
  }

  /** Summary of a run without touching the inbox view - used for the "before" numbers. */
  const collectSummary = (wf) =>
    new Promise((resolve, reject) => {
      let found = null
      runWorkflow(source, wf, null, (event) => {
        if (event.event === 'summary') found = event
      }).then(() => resolve(found), reject)
    })

  const runAndCompare = async () => {
    if (!pendingCompare) return
    setChatBusy(true)
    try {
      const before = pendingCompare.before || (await collectSummary(pendingCompare.oldWorkflow))
      await run(null, (after) => {
        setMessages((prev) => [
          ...prev.map((m) => (m.kind === 'accepted' ? { ...m, canCompare: false } : m)),
          { role: 'assistant', kind: 'compare', before, after },
        ])
      })
      setPendingCompare(null)
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', kind: 'error', text: e.message }])
    } finally {
      setChatBusy(false)
    }
  }

  const restoreVersion = (v) => {
    const nextVersions = keepVersion('Before restoring an earlier version')
    setWorkflow(v.workflow)
    setThresholds(thresholdsOf(v.workflow, v.thresholds || {}))
    setBuildId((id) => id + 1)
    patchProject({ workflow: v.workflow, thresholds: v.thresholds || {}, versions: nextVersions })
    setProposal(null)
    resetRun()
    setMessages((prev) => [...prev, { role: 'assistant', kind: 'answer', text: 'Restored the earlier version.' }])
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

  const editing = !proposal && selectedStep && nodeMap[selectedStep] ? nodeMap[selectedStep] : null

  return (
    <div className="flex h-full flex-col bg-paper text-ink">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule bg-sheet px-4 py-2.5 lg:flex-nowrap lg:gap-8 lg:px-5 lg:py-0">
        <div className="lg:py-3">
          <h1 className="font-cond text-[19px] font-semibold leading-none tracking-[-0.01em]">Routing Slip</h1>
          <p className="mt-1 hidden text-[12px] text-ink-2 sm:block">A process in plain words, run on a real inbox</p>
        </div>

        <div className="order-3 w-full lg:order-none lg:w-auto">
          <UseCaseMenu
            datasets={datasets}
            projects={projects}
            current={current}
            project={project}
            onOpen={open}
            onNew={() => setShowNew(true)}
            onImport={importFile}
          />
        </div>

        <div className="ml-auto flex items-center gap-3 sm:gap-5">
          <Legend />
          <button onClick={() => setShowTour(true)} className="whitespace-nowrap text-[13px] text-llm hover:underline">
            <span className="hidden sm:inline">How it works</span>
            <span className="sm:hidden">Tour</span>
          </button>
          <ThemeToggle />
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-rule bg-human-soft px-4 py-2 text-[13px] text-ink lg:px-5">
          {error}
          <button className="text-[12px] text-ink-2 hover:text-ink" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {dataset ? (
        <>
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <ProcessPanel
            mobileShow={view === 'process'}
            dataset={dataset}
            description={description}
            setDescription={setDescription}
            onBuild={build}
            building={building}
            log={log}
            onExport={() => exportProject(loadProjects().find((p) => p.id === project.id))}
            onDelete={removeProject}
            tab={leftTab}
            onTab={setLeftTab}
            chatBadge={Boolean(proposal)}
            chat={
              <ChatPanel
                messages={messages}
                onSend={sendChat}
                onAccept={acceptProposal}
                onDiscard={discardProposal}
                onRunCompare={runAndCompare}
                busy={chatBusy || running || building}
                hasWorkflow={Boolean(runnable)}
                selectedTitle={selectedResult?.title}
                versions={versions}
                onRestore={restoreVersion}
              />
            }
          >
            {project && (
              <ConnectPanel
                project={project}
                workflow={runnable}
                onPublished={(published) => patchProject({ published })}
              />
            )}
          </ProcessPanel>

          <main className={`min-h-0 min-w-0 flex-1 flex-col ${view === 'workflow' ? 'flex' : 'hidden lg:flex'}`}>
            <Scoreboard summary={summary} total={dataset.items.length} custom={Boolean(project)} />
            <div data-tour="canvas" className="relative min-h-0 flex-1">
              {runnable ? (
                <WorkflowCanvas
                  key={`${current.kind}-${current.id}-${buildId}-${proposal ? "proposal" : "current"}`}
                  workflow={proposal ? withThresholds(proposal.workflow, thresholdsOf(proposal.workflow, thresholds)) : runnable}
                  diff={proposal?.diff}
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
            mobileShow={view === 'inbox'}
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
        <nav aria-label="Panels" className="grid shrink-0 grid-cols-3 border-t border-rule bg-sheet pb-[env(safe-area-inset-bottom)] lg:hidden">
          {VIEWS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              aria-current={view === key ? 'page' : undefined}
              className={`relative py-3 text-[13.5px] ${view === key ? 'font-medium text-ink' : 'text-ink-3'}`}
            >
              {view === key && <span className="absolute inset-x-6 top-0 h-0.5 bg-ink" />}
              {label}
              {key === 'inbox' && running && <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-jev align-middle" />}
            </button>
          ))}
        </nav>
        </>
      ) : (
        !error && <p className="p-8 text-[14px] text-ink-2">Loading…</p>
      )}

      {showTour && dataset && (
        <Onboarding
          onStep={(target) => {
            const panel = { process: 'process', chat: 'process', canvas: 'workflow', results: 'workflow', inbox: 'inbox' }[target]
            if (panel) setView(panel)
            if (target === 'chat') setLeftTab('chat')
            if (target === 'process') setLeftTab('process')
          }}
          onClose={(startRun) => {
            setShowTour(false)
            if (startRun && runnable && !running) run()
          }}
        />
      )}
      {showNew && <NewProject onCreate={createProject} onCancel={() => setShowNew(false)} checkSpec={checkSpec} />}
    </div>
  )
}
