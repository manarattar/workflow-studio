import { useState } from 'react'
import { HUMAN_REVIEW, KIND, humanize, seconds } from '../theme'

function OutcomeChip({ outcome }) {
  const human = outcome === HUMAN_REVIEW
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${human ? KIND.human.chip : KIND.outcome.chip}`}>
      {human ? 'human review' : humanize(outcome)}
    </span>
  )
}

function ItemRow({ item, result, running, selected, onSelect }) {
  const title = item.subject || item.message
  const from = item.sender || item.channel
  return (
    <button
      onClick={() => result && onSelect(item.id)}
      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
        selected ? 'border-sky-500 bg-sky-500/10' : 'border-slate-800 bg-slate-900 hover:border-slate-700'
      } ${result ? '' : 'cursor-default'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-slate-500">{from}</span>
        {result ? (
          result.correct === false ? (
            <span className="text-[11px] text-rose-400" title={`Reference: ${humanize(result.expected)}`}>✗</span>
          ) : result.correct ? (
            <span className="text-[11px] text-emerald-400">✓</span>
          ) : null
        ) : (
          running && <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
        )}
      </div>
      <p className="mt-0.5 line-clamp-2 text-xs text-slate-200">{title}</p>
      {result && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <OutcomeChip outcome={result.outcome} />
          {result.correct === false && (
            <span className="text-[10px] text-slate-500">ref: {humanize(result.expected)}</span>
          )}
        </div>
      )}
    </button>
  )
}

function Bars({ probabilities }) {
  const entries = Object.entries(probabilities).sort((a, b) => b[1] - a[1])
  return (
    <div className="mt-2 space-y-1">
      {entries.map(([option, p]) => (
        <div key={option} className="flex items-center gap-2 text-[11px]">
          <span className="w-24 shrink-0 truncate text-slate-400" title={humanize(option)}>{humanize(option)}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-violet-400" style={{ width: `${p * 100}%` }} />
          </div>
          <span className="w-9 text-right font-mono text-slate-300">{Math.round(p * 100)}%</span>
        </div>
      ))}
    </div>
  )
}

function StepCard({ step, node }) {
  if (step.kind === 'outcome') return null
  const k = KIND[step.kind]
  return (
    <li className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <div className="flex items-center gap-2">
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${k.chip}`}>{k.label}</span>
        <span className="text-xs font-medium text-slate-200">{node?.label || step.node}</span>
      </div>

      {step.kind === 'code' && (
        <p className="mt-2 font-mono text-[11px] text-slate-400">
          {step.field} = {JSON.stringify(step.value)} → <span className="text-slate-200">{step.result ? 'yes' : 'no'}</span>
        </p>
      )}

      {step.kind === 'jev' && step.error && (
        <p className="mt-2 text-[11px] text-rose-300">Jev unreachable — handed to a person.</p>
      )}
      {step.kind === 'jev' && !step.error && (
        <>
          {node?.question && <p className="mt-2 text-[11px] italic text-slate-400">“{node.question}”</p>}
          <Bars probabilities={step.probabilities} />
          <p className={`mt-2 text-[11px] ${step.confident ? 'text-slate-400' : 'text-amber-300'}`}>
            Confidence {Math.round(step.confidence * 100)}% (needs {Math.round(step.threshold * 100)}%) —{' '}
            {step.confident ? `follows “${humanize(step.choice)}”` : 'not sure enough, a person decides'}
            <span className="text-slate-600"> · {step.latency_ms} ms</span>
          </p>
        </>
      )}

      {step.kind === 'llm' && (
        <div className="mt-2 whitespace-pre-wrap rounded-md border border-cyan-500/20 bg-cyan-500/5 p-2.5 text-[12px] leading-relaxed text-cyan-50">
          {step.text}
        </div>
      )}
    </li>
  )
}

function Trace({ result, nodeMap, onBack }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-800 p-3">
        <button onClick={onBack} className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200">
          ← Inbox
        </button>
        <span className="truncate text-xs text-slate-300">{result.title}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <ol className="space-y-2">
          {result.steps.map((step, i) => (
            <StepCard key={i} step={step} node={nodeMap[step.node]} />
          ))}
        </ol>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-800 p-3 text-xs">
          <span className="text-slate-400">Ends in</span>
          <OutcomeChip outcome={result.outcome} />
        </div>
        {result.correct != null && (
          <p className={`mt-2 text-[11px] ${result.correct ? 'text-emerald-400' : 'text-rose-400'}`}>
            {result.correct
              ? 'Matches the reference policy.'
              : `Reference policy says: ${humanize(result.expected)}.`}
          </p>
        )}
        <p className="mt-2 text-[11px] text-slate-600">
          {result.jev_calls} Jev · {result.llm_calls} LLM · {seconds(result.latency_ms)}
        </p>
      </div>
    </div>
  )
}

function Composer({ dataset, onRun, disabled }) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState({})
  const textField = dataset.fields.body ? 'body' : 'message'
  const fields = Object.entries(dataset.fields)
  const filled = (values[textField] || '').trim().length > 0
  if (!open) {
    return (
      <div className="border-t border-slate-800 p-3">
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-md border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-violet-500 hover:text-violet-200"
        >
          + Test your own {dataset.fields.body ? 'email' : 'message'}
        </button>
      </div>
    )
  }
  return (
    <div className="space-y-2 border-t border-slate-800 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Test your own</p>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-200">✕</button>
      </div>
      {fields.map(([name, type]) =>
        name === textField ? (
          <textarea
            key={name}
            rows={3}
            placeholder={textField === 'body' ? 'Email text…' : 'Customer message…'}
            value={values[name] || ''}
            onChange={(e) => setValues({ ...values, [name]: e.target.value })}
            className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 p-2 text-xs text-slate-100 placeholder-slate-600 focus:border-violet-500 focus:outline-none"
          />
        ) : (
          <input
            key={name}
            type={type === 'number' ? 'number' : 'text'}
            placeholder={humanize(name)}
            value={values[name] || ''}
            onChange={(e) => setValues({ ...values, [name]: e.target.value })}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:border-violet-500 focus:outline-none"
          />
        ),
      )}
      <button
        disabled={disabled || !filled}
        onClick={() => {
          const item = Object.fromEntries(
            fields.map(([name, type]) => [
              name,
              type === 'number' ? (values[name] === '' || values[name] == null ? null : Number(values[name])) : values[name] || '',
            ]),
          )
          onRun(item)
        }}
        className="w-full rounded-md border border-violet-500/50 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Run it through the workflow
      </button>
    </div>
  )
}

export default function InboxPanel({
  dataset, results, running, selectedId, onSelect, nodeMap, canRun, onRunInbox, onRunCustom,
}) {
  const selected = selectedId && results[selectedId]
  const done = Object.keys(results).filter((id) => id !== 'custom').length
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-slate-800 bg-slate-900/60">
      {selected ? (
        <Trace result={selected} nodeMap={nodeMap} onBack={() => onSelect(null)} />
      ) : (
        <>
          <div className="border-b border-slate-800 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Step 2</p>
            <h2 className="mt-0.5 text-sm font-semibold text-slate-100">Run it on the inbox</h2>
            <button
              onClick={onRunInbox}
              disabled={!canRun || running}
              className="mt-3 w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running ? `Processing… ${done}/${dataset.items.length}` : `Run on ${dataset.items.length} ${dataset.id === 'accounts_payable' ? 'emails' : 'messages'}`}
            </button>
            {!canRun && <p className="mt-2 text-[11px] text-slate-500">Build a workflow first.</p>}
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
            {results.custom && (
              <ItemRow
                item={{ id: 'custom', subject: results.custom.title, sender: 'your test' }}
                result={results.custom}
                selected={false}
                onSelect={onSelect}
              />
            )}
            {dataset.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                result={results[item.id]}
                running={running}
                selected={false}
                onSelect={onSelect}
              />
            ))}
          </div>
          {canRun && <Composer dataset={dataset} onRun={onRunCustom} disabled={running} />}
        </>
      )}
    </aside>
  )
}
