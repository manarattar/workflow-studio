import { usd, seconds } from '../theme'

function LogLine({ entry }) {
  if (entry.stage === 'drafting') {
    return (
      <li className="flex gap-2">
        <span className="text-cyan-400">●</span>
        <span>
          {entry.attempt === 1 ? 'LLM drafts the workflow' : `LLM fixes it (attempt ${entry.attempt})`}
          {entry.pending && <span className="ml-1 animate-pulse text-slate-500">…</span>}
        </span>
      </li>
    )
  }
  if (entry.stage === 'problems') {
    return (
      <li className="flex gap-2">
        <span className="text-amber-400">●</span>
        <div>
          <p>Validator caught {entry.problems.length} problem{entry.problems.length > 1 ? 's' : ''} — sent back</p>
          <ul className="mt-1 space-y-1 text-[11px] leading-snug text-amber-200/70">
            {entry.problems.slice(0, 4).map((p, i) => (
              <li key={i} className="border-l border-amber-500/30 pl-2">{p}</li>
            ))}
            {entry.problems.length > 4 && <li className="pl-2">+{entry.problems.length - 4} more</li>}
          </ul>
        </div>
      </li>
    )
  }
  if (entry.stage === 'done') {
    const r = entry.result
    return (
      <li className="flex gap-2">
        <span className="text-emerald-400">●</span>
        <span>
          Valid workflow · {r.workflow.nodes.length} steps · {seconds(r.latency_ms)} · {usd(r.cost_usd)}
        </span>
      </li>
    )
  }
  return (
    <li className="flex gap-2">
      <span className="text-rose-400">●</span>
      <div>
        <p>Could not build a valid workflow</p>
        <ul className="mt-1 space-y-1 text-[11px] text-rose-200/70">
          {(entry.problems || []).slice(0, 4).map((p, i) => (
            <li key={i} className="border-l border-rose-500/30 pl-2">{p}</li>
          ))}
        </ul>
      </div>
    </li>
  )
}

export default function ProcessPanel({ dataset, description, setDescription, onBuild, building, log }) {
  const isReference = dataset && description.trim() === dataset.template.trim()
  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-r border-slate-800 bg-slate-900/60">
      <div className="border-b border-slate-800 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Step 1</p>
        <h2 className="mt-0.5 text-sm font-semibold text-slate-100">Describe the process in plain words</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Write it the way you'd explain it to a new colleague. The LLM turns it into steps; you can
          change any rule and rebuild.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={9}
          maxLength={1500}
          className="w-full shrink-0 resize-none rounded-lg border border-slate-700 bg-slate-950 p-3 text-[13px] leading-relaxed text-slate-100 placeholder-slate-600 focus:border-violet-500 focus:outline-none"
          placeholder="e.g. Block anything that looks like fraud. Invoices over €1,000 need a manager…"
        />
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          {isReference ? (
            <span>Reference policy for this inbox</span>
          ) : (
            <button className="text-violet-300 hover:underline" onClick={() => setDescription(dataset.template)}>
              Reset to reference policy
            </button>
          )}
          <span>{description.length}/1500</span>
        </div>

        {dataset.knowledge?.length > 0 && (
          <details className="shrink-0 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs">
            <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
              Knowledge base · {dataset.knowledge.length} facts the LLM may use
            </summary>
            <ul className="mt-2 space-y-1.5 text-[11px] leading-snug text-slate-400">
              {dataset.knowledge.map((fact, i) => (
                <li key={i} className="border-l border-cyan-500/30 pl-2">{fact}</li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-500">
              Drafts may only use these facts. Anything else gets “a colleague will follow up”, never a
              made-up answer.
            </p>
          </details>
        )}

        <button
          onClick={onBuild}
          disabled={building || !description.trim()}
          className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {building ? 'Building workflow…' : 'Build workflow'}
        </button>

        {log.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Build log</p>
            <ul className="space-y-2 text-xs text-slate-300">
              {log.map((entry, i) => (
                <LogLine key={i} entry={entry} />
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              The LLM's output is never trusted as-is: every draft is checked (steps exist, no loops,
              numbers handled by code, options described concretely) and problems go back to it.
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
