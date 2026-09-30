import { useState } from 'react'
import { publishProject, recentRuns, unpublishProject, updatePublished } from '../api'
import { specOf } from '../projects'
import { HUMAN_REVIEW, humanize } from '../theme'

function exampleItem(project) {
  const first = project.items?.[0] || {}
  return Object.fromEntries(
    Object.entries(project.fields).map(([f, t]) => [f, first[f] ?? (t === 'number' ? 0 : `example ${f}`)]),
  )
}

function CopyBlock({ id, text }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative">
      <pre id={id} className="num max-h-40 overflow-auto rounded-[3px] border border-rule bg-paper px-2.5 py-2 text-[11.5px] leading-relaxed text-ink">
        {text}
      </pre>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch {
            window.getSelection()?.selectAllChildren(document.getElementById(id))
          }
        }}
        className="absolute right-1.5 top-1.5 rounded-[3px] border border-rule bg-sheet px-1.5 py-0.5 text-[11px] text-ink-2 hover:text-ink"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

/** Publish the project's workflow as an HTTP endpoint another system can call. */
export default function ConnectPanel({ project, workflow, onPublished }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [runs, setRuns] = useState(null)
  const pub = project.published
  const stale = pub && JSON.stringify(workflow) !== pub.workflowSnapshot

  const act = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const publish = () =>
    act(async () => {
      const r = await publishProject(specOf(project, { withItems: false }), workflow)
      onPublished({ id: r.id, api_key: r.api_key, workflowSnapshot: JSON.stringify(workflow) })
    })
  const update = () =>
    act(async () => {
      await updatePublished(pub, specOf(project, { withItems: false }), workflow)
      onPublished({ ...pub, workflowSnapshot: JSON.stringify(workflow) })
    })
  const unpublish = () =>
    act(async () => {
      await unpublishProject(pub)
      onPublished(null)
      setRuns(null)
    })
  const loadRuns = () => act(async () => setRuns((await recentRuns(pub)).runs))

  const url = pub ? `${window.location.origin}/api/hooks/${pub.id}` : ''
  const body = JSON.stringify(exampleItem(project))
  const curl = `curl -X POST ${url} \\\n  -H "Content-Type: application/json" \\\n  -H "X-Routing-Key: ${pub?.api_key}" \\\n  -d '${body}'`
  const python = `import requests\n\nr = requests.post(\n    "${url}",\n    headers={"X-Routing-Key": "${pub?.api_key}"},\n    json=${body},\n)\nprint(r.json()["outcome"])`

  return (
    <section className="border-t border-rule pt-3">
      <h3 className="font-cond text-[13px] font-semibold text-ink-2">Connect</h3>
      {!pub ? (
        <>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-2">
            Publish this workflow as an endpoint. A client's system sends one item as JSON and gets back the
            outcome, Jev's decisions and any drafted text. Only the workflow and outcomes are stored, never your
            example items.
          </p>
          <button onClick={publish} disabled={busy || !workflow}
            className="mt-2 w-full rounded-[3px] border border-ink px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-paper disabled:opacity-40">
            {busy ? 'Publishing…' : 'Publish as endpoint'}
          </button>
          {!workflow && <p className="mt-1 text-[12px] text-ink-3">Build a workflow first.</p>}
        </>
      ) : (
        <div className="mt-1.5 space-y-2 text-[12.5px]">
          <p className="text-ink-2">
            Live endpoint. Keep the key secret: anyone with it can run items at your cost (limit 100 a day).
          </p>
          {stale && (
            <p className="rounded-[3px] bg-human-soft px-2 py-1.5 text-ink">
              The workflow changed since you published it. The endpoint still runs the old version.
            </p>
          )}
          <CopyBlock id="cp-curl" text={curl} />
          <details>
            <summary className="cursor-pointer text-ink-2 hover:text-ink">Python</summary>
            <div className="mt-1.5"><CopyBlock id="cp-python" text={python} /></div>
          </details>
          <div className="flex flex-wrap gap-2">
            {stale && (
              <button onClick={update} disabled={busy} className="rounded-[3px] bg-ink px-3 py-1 text-[12.5px] font-medium text-paper hover:opacity-90 disabled:opacity-40">
                Update endpoint
              </button>
            )}
            <button onClick={loadRuns} disabled={busy} className="rounded-[3px] border border-rule px-3 py-1 text-[12.5px] text-ink hover:bg-paper">
              {runs ? 'Refresh calls' : 'Recent calls'}
            </button>
            <button onClick={unpublish} disabled={busy} className="rounded-[3px] px-2 py-1 text-[12.5px] text-bad hover:underline">
              Unpublish
            </button>
          </div>
          {runs && (
            runs.length === 0 ? (
              <p className="text-ink-3">No calls yet.</p>
            ) : (
              <ul className="max-h-48 divide-y divide-rule overflow-y-auto rounded-[3px] border border-rule">
                {runs.map((r, i) => (
                  <li key={i} className="px-2.5 py-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="num text-[11px] text-ink-3">{new Date(r.ts * 1000).toLocaleString()}</span>
                      <span className={`text-[11.5px] ${r.outcome === HUMAN_REVIEW ? 'text-human' : 'text-done'}`}>
                        {r.outcome === HUMAN_REVIEW ? 'to a person' : humanize(r.outcome)}
                      </span>
                    </div>
                    <p className="truncate text-ink-2">{r.text}</p>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[12px] text-bad">{error}</p>}
    </section>
  )
}
