import { useState } from 'react'
import { seconds, usd } from '../theme'

const MARK = {
  loaded: 'bg-done',
  drafting: 'bg-llm',
  problems: 'bg-human',
  done: 'bg-done',
  failed: 'bg-bad',
}

function LogLine({ entry }) {
  let body
  if (entry.stage === 'loaded') {
    body = <p>Opened the saved workflow for this policy. Change the text and build to make your own.</p>
  } else if (entry.stage === 'drafting') {
    body = (
      <p>
        {entry.attempt === 1 ? 'LLM drafts the workflow' : `LLM corrects it, attempt ${entry.attempt}`}
        {entry.pending && <span className="ml-1 animate-pulse text-ink-3">…</span>}
      </p>
    )
  } else if (entry.stage === 'problems' || entry.stage === 'failed') {
    const n = entry.problems?.length || 0
    body = (
      <div>
        <p>
          {entry.stage === 'failed'
            ? 'No valid workflow after 4 attempts. Try describing the rules more plainly.'
            : `Validator found ${n} problem${n === 1 ? '' : 's'} and sent them back`}
        </p>
        <ul className="mt-1.5 space-y-1 text-[12px] leading-snug text-ink-2">
          {(entry.problems || []).slice(0, 3).map((p, i) => (
            <li key={i} className="border-l border-rule pl-2">{p}</li>
          ))}
          {n > 3 && <li className="pl-2 text-ink-3">and {n - 3} more</li>}
        </ul>
      </div>
    )
  } else {
    const r = entry.result
    body = (
      <p>
        Valid workflow, {r.workflow.nodes.length} steps{' '}
        <span className="num text-ink-3">
          {seconds(r.latency_ms)} · {usd(r.cost_usd)}
        </span>
      </p>
    )
  }
  return (
    <li className="grid grid-cols-[10px_1fr] gap-2">
      <span className={`mt-[7px] h-1.5 w-1.5 rounded-full ${MARK[entry.stage]}`} />
      <div className="text-[13px] leading-snug text-ink">{body}</div>
    </li>
  )
}

export default function ProcessPanel({
  dataset, description, setDescription, onBuild, building, log, onExport, onDelete, children,
  tab = 'process', onTab, chat, chatBadge,
}) {
  const hasReference = Boolean(dataset.template)
  const isReference = hasReference && description.trim() === dataset.template.trim()
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <aside data-tour="process" className="flex w-[340px] shrink-0 flex-col border-r border-rule bg-sheet">
      <div role="tablist" aria-label="Left panel" className="flex border-b border-rule px-5">
        {[['process', 'Process'], ['chat', 'Chat']].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            id={`tab-${key}`}
            data-tour={key === 'chat' ? 'chat' : undefined}
            aria-selected={tab === key}
            onClick={() => onTab?.(key)}
            className={`-mb-px mr-5 border-b-2 py-2.5 text-[13.5px] ${
              tab === key ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            {label}
            {key === 'chat' && chatBadge ? <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-human align-middle" /> : null}
          </button>
        ))}
      </div>
      {tab === 'chat' ? chat : (
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="truncate font-cond text-[17px] font-semibold text-ink">
              {dataset.custom ? dataset.name : 'The process'}
            </h2>
            {dataset.custom && (
              <div className="flex shrink-0 gap-3 text-[12px]">
                <button onClick={onExport} className="text-llm hover:underline">Export</button>
                {confirmDelete ? (
                  <span className="flex gap-2">
                    <button onClick={onDelete} className="text-bad hover:underline">Delete it</button>
                    <button onClick={() => setConfirmDelete(false)} className="text-ink-3 hover:text-ink">Keep</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} className="text-ink-3 hover:text-bad">Delete</button>
                )}
              </div>
            )}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            Write it the way you'd brief a new colleague. The LLM turns it into steps; change any rule
            and build again.
          </p>
        </div>

        <div>
          <label htmlFor="process" className="sr-only">Process description</label>
          <textarea
            id="process"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={10}
            maxLength={1500}
            className="w-full shrink-0 resize-y rounded-[3px] border border-rule bg-paper px-3 py-2.5 text-[13.5px] leading-relaxed text-ink placeholder:text-ink-3 focus:border-ink-2 focus:outline-none"
            placeholder={
              dataset.custom
                ? 'Say which items go where and why, in the order you check them…'
                : 'Block anything that looks like fraud. Invoices over €1,000 need a manager…'
            }
          />
          <div className="mt-1 flex items-center justify-between text-[12px] text-ink-3">
            {!hasReference ? (
              <span />
            ) : isReference ? (
              <span>Reference policy</span>
            ) : (
              <button className="text-llm hover:underline" onClick={() => setDescription(dataset.template)}>
                Restore reference policy
              </button>
            )}
            <span className="num">{description.length}/1500</span>
          </div>
          {dataset.custom && (
            <p className="mt-2 text-[12px] leading-snug text-ink-2">
              Outcomes you can route to:{' '}
              {Object.keys(dataset.outcomes).map((o, i) => (
                <span key={o}>
                  {i > 0 && ', '}
                  <span className="num text-ink">{o}</span>
                </span>
              ))}
              . Items it isn't sure about go to a person.
            </p>
          )}
        </div>

        <button
          onClick={onBuild}
          disabled={building || !description.trim()}
          className="rounded-[3px] bg-ink px-4 py-2.5 text-[14px] font-medium text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {building ? 'Building…' : 'Build workflow'}
        </button>

        {children}

        {dataset.knowledge?.length > 0 && (
          <details className="border-t border-rule pt-3 text-[13px]">
            <summary className="cursor-pointer font-cond font-semibold text-ink-2 hover:text-ink">
              Facts the LLM may use <span className="num font-normal text-ink-3">({dataset.knowledge.length})</span>
            </summary>
            <ul className="mt-2 space-y-1.5 text-[12.5px] leading-snug text-ink-2">
              {dataset.knowledge.map((fact, i) => (
                <li key={i} className="border-l border-rule pl-2">{fact}</li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] leading-snug text-ink-3">
              Drafted replies may only use these facts. For anything else they say a colleague will
              follow up.
            </p>
          </details>
        )}

        {log.length > 0 && (
          <section className="border-t border-rule pt-3">
            <h3 className="font-cond text-[13px] font-semibold text-ink-2">Build log</h3>
            <ol className="mt-2 space-y-2.5">
              {log.map((entry, i) => (
                <LogLine key={i} entry={entry} />
              ))}
            </ol>
            <p className="mt-3 text-[12px] leading-snug text-ink-3">
              Every draft is checked before it runs: steps exist, nothing loops, amounts are compared in
              code, decisions are described concretely. Problems go back to the LLM.
            </p>
          </section>
        )}
      </div>
      )}
    </aside>
  )
}
