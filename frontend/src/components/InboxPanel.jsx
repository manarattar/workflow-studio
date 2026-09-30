import { useState } from 'react'
import Glyph from './Glyph'
import { HUMAN_REVIEW, KIND, humanize, seconds } from '../theme'

/** The outcome, marked on the item the way an office stamps a routing slip. */
function Stamp({ outcome }) {
  const human = outcome === HUMAN_REVIEW
  return (
    <span
      className={`inline-block -rotate-[1.5deg] rounded-[2px] border px-1.5 py-[1px] font-cond text-[10.5px] font-semibold uppercase tracking-[0.08em] ${
        human ? 'border-human text-human' : 'border-done text-done'
      }`}
    >
      {human ? 'to a person' : humanize(outcome)}
    </span>
  )
}

function Verdict({ result }) {
  if (!result || result.correct == null) return null
  return result.correct ? (
    <span className="text-[12px] text-done" title="Matches the reference policy">✓</span>
  ) : (
    <span className="text-[12px] text-bad" title={`Reference policy: ${humanize(result.expected)}`}>✗</span>
  )
}

function ItemRow({ item, result, running, onSelect, display }) {
  const title = item.subject || item.message || (display && item[display.titleField]) || ''
  const from = item.sender || item.channel || (display?.fromField && item[display.fromField]) || ''
  const clickable = Boolean(result)
  return (
    <li>
      <button
        onClick={() => clickable && onSelect(item.id)}
        disabled={!clickable}
        className="grid w-full grid-cols-[1fr_auto] gap-x-3 border-b border-rule px-4 py-2.5 text-left transition-colors hover:bg-paper disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="truncate text-[12px] text-ink-3">{from}</span>
        <span className="row-span-2 flex flex-col items-end justify-between gap-1">
          {result ? <Stamp outcome={result.outcome} /> : running && <span className="mt-1 h-1.5 w-1.5 animate-pulse rounded-full bg-jev" />}
          <Verdict result={result} />
        </span>
        <span className="line-clamp-2 text-[13px] leading-snug text-ink">{title}</span>
      </button>
    </li>
  )
}

function Bars({ probabilities, chosen }) {
  const entries = Object.entries(probabilities).sort((a, b) => b[1] - a[1])
  return (
    <div className="mt-2 space-y-1">
      {entries.map(([option, p]) => (
        <div key={option} className="grid grid-cols-[88px_1fr_38px] items-center gap-2 text-[12px]">
          <span className={`truncate ${option === chosen ? 'text-ink' : 'text-ink-3'}`} title={humanize(option)}>
            {humanize(option)}
          </span>
          <div className="h-1.5 overflow-hidden rounded-full bg-jev-soft">
            <div className="h-full rounded-full bg-jev" style={{ width: `${p * 100}%` }} />
          </div>
          <span className="num text-right text-ink-2">{Math.round(p * 100)}%</span>
        </div>
      ))}
    </div>
  )
}

function StepRow({ step, node }) {
  if (step.kind === 'outcome') return null
  const k = KIND[step.kind]
  return (
    <li className="grid grid-cols-[16px_1fr] gap-2.5 border-b border-rule px-4 py-3">
      <Glyph kind={step.kind} className={`mt-[3px] ${k.text}`} />
      <div className="min-w-0">
        <p className="text-[13px] text-ink">
          {node?.label || step.node}{' '}
          <span className={`font-cond text-[11px] font-semibold uppercase tracking-[0.07em] ${k.text}`}>{k.label}</span>
        </p>

        {step.kind === 'code' && (
          <p className="num mt-1 text-[12px] text-ink-2">
            {step.field} = {JSON.stringify(step.value)} → {step.result ? 'yes' : 'no'}
          </p>
        )}

        {step.kind === 'jev' && step.error && (
          <p className="mt-1 text-[12px] text-bad">Jev could not be reached, so a person decides.</p>
        )}
        {step.kind === 'jev' && !step.error && (
          <>
            {node?.question && <p className="mt-1 text-[12px] text-ink-2">{node.question}</p>}
            <Bars probabilities={step.probabilities} chosen={step.choice} />
            <p className={`mt-1.5 text-[12px] ${step.confident ? 'text-ink-2' : 'text-human'}`}>
              <span className="num">{Math.round(step.confidence * 100)}%</span> sure, needs{' '}
              <span className="num">{Math.round(step.threshold * 100)}%</span>.{' '}
              {step.confident ? `Follows “${humanize(step.choice)}”.` : 'Not sure enough, so a person decides.'}
              <span className="num text-ink-3"> {step.latency_ms} ms</span>
            </p>
          </>
        )}

        {step.kind === 'llm' && (
          <div className="mt-2 whitespace-pre-wrap rounded-[3px] border border-rule bg-paper px-3 py-2.5 text-[13px] leading-relaxed text-ink">
            {step.text}
          </div>
        )}
      </div>
    </li>
  )
}

function Trace({ result, nodeMap, onBack }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-rule px-4 py-3">
        <button onClick={onBack} className="text-[13px] text-llm hover:underline">← Back to inbox</button>
        <p className="mt-1.5 text-[13px] leading-snug text-ink">{result.title}</p>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto">
        {result.steps.map((step, i) => (
          <StepRow key={i} step={step} node={nodeMap[step.node]} />
        ))}
        <li className="flex items-center justify-between px-4 py-3">
          <span className="text-[13px] text-ink-2">Ends in</span>
          <Stamp outcome={result.outcome} />
        </li>
        {result.correct != null && (
          <li className={`px-4 text-[12px] ${result.correct ? 'text-done' : 'text-bad'}`}>
            {result.correct ? 'Matches the reference policy.' : `The reference policy says ${humanize(result.expected)}.`}
          </li>
        )}
        <li className="num px-4 py-2 text-[12px] text-ink-3">
          {result.jev_calls} Jev · {result.llm_calls} LLM · {seconds(result.latency_ms)}
        </li>
      </ol>
    </div>
  )
}

/** The main text field of an item: where a person types the message itself. */
const textFieldOf = (dataset) =>
  dataset.fields.body ? 'body' : dataset.fields.message ? 'message' : dataset.display?.titleField

const nounOf = (dataset, plural) => {
  const one = dataset.fields.body ? 'email' : dataset.custom ? 'item' : 'message'
  return plural ? `${one}s` : one
}

function Composer({ dataset, onRun, onAddExample, disabled }) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState({})
  const [expected, setExpected] = useState('')
  const textField = textFieldOf(dataset)
  const noun = nounOf(dataset)
  const fields = Object.entries(dataset.fields)
  const filled = fields.some(([name]) => String(values[name] ?? '').trim())

  const item = () =>
    Object.fromEntries(
      fields.map(([name, type]) => [
        name,
        type === 'number' ? (values[name] === '' || values[name] == null ? null : Number(values[name])) : values[name] || '',
      ]),
    )

  if (!open) {
    return (
      <div className="border-t border-rule px-4 py-3">
        <button onClick={() => setOpen(true)} className="text-[13px] text-llm hover:underline">
          {dataset.custom ? `Test or add an ${noun}` : `Test your own ${noun}`}
        </button>
      </div>
    )
  }
  const input =
    'w-full rounded-[3px] border border-rule bg-paper px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-ink-2 focus:outline-none'
  return (
    <form
      className="max-h-[55%] space-y-2 overflow-y-auto border-t border-rule px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        onRun(item())
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-cond text-[13px] font-semibold text-ink-2">
          {dataset.custom ? `Test or add an ${noun}` : `Test your own ${noun}`}
        </h3>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-ink-3 hover:text-ink">Close</button>
      </div>
      {fields.map(([name, type]) =>
        name === textField ? (
          <textarea
            key={name}
            id={`custom-${name}`}
            rows={3}
            aria-label={humanize(name)}
            placeholder={noun === 'email' ? 'Email text' : noun === 'message' ? 'Customer message' : humanize(name)}
            value={values[name] || ''}
            onChange={(e) => setValues({ ...values, [name]: e.target.value })}
            className={`${input} resize-none`}
          />
        ) : (
          <input
            key={name}
            id={`custom-${name}`}
            type={type === 'number' ? 'number' : 'text'}
            aria-label={humanize(name)}
            placeholder={humanize(name)}
            value={values[name] || ''}
            onChange={(e) => setValues({ ...values, [name]: e.target.value })}
            className={input}
          />
        ),
      )}
      <button
        type="submit"
        disabled={disabled || !filled}
        className="w-full rounded-[3px] border border-ink px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
      >
        Run it through the workflow
      </button>
      {dataset.custom && (
        <div className="flex gap-2 border-t border-rule pt-2">
          <select
            id="custom-expected"
            aria-label="Right outcome for this example"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            className={`${input} flex-1`}
          >
            <option value="">Right outcome (optional)</option>
            {Object.keys(dataset.outcomes).map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
          </select>
          <button
            type="button"
            disabled={!filled || dataset.items.length >= 50}
            onClick={() => {
              onAddExample({ ...item(), ...(expected ? { expected } : {}) })
              setValues({})
              setExpected('')
            }}
            className="rounded-[3px] border border-rule px-3 text-[13px] text-ink hover:bg-paper disabled:opacity-40"
          >
            Add to examples
          </button>
        </div>
      )}
    </form>
  )
}

export default function InboxPanel({
  dataset, results, running, selectedId, onSelect, nodeMap, canRun, onRunInbox, onRunCustom, onAddExample,
}) {
  const selected = selectedId && results[selectedId]
  const done = Object.keys(results).filter((id) => id !== 'custom').length
  const noun = nounOf(dataset, true)
  const empty = dataset.items.length === 0
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-rule bg-sheet">
      {selected ? (
        <Trace result={selected} nodeMap={nodeMap} onBack={() => onSelect(null)} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-4">
            <div>
              <h2 className="font-cond text-[17px] font-semibold text-ink">Inbox</h2>
              <p className="num text-[12px] text-ink-3">
                {running ? `${done} of ${dataset.items.length} processed` : `${dataset.items.length} ${noun}`}
              </p>
            </div>
            <button
              onClick={onRunInbox}
              disabled={!canRun || running || empty}
              className="rounded-[3px] bg-ink px-4 py-2 text-[14px] font-medium text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running ? 'Running…' : 'Run inbox'}
            </button>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {results.custom && (
              <ItemRow item={{ id: 'custom', subject: results.custom.title, sender: 'Your test' }} result={results.custom} onSelect={onSelect} />
            )}
            {dataset.items.map((item) => (
              <ItemRow key={item.id} item={item} result={results[item.id]} running={running} onSelect={onSelect} display={dataset.display} />
            ))}
            {empty && (
              <li className="px-4 py-6 text-[13px] leading-relaxed text-ink-2">
                No example items yet. Add some below, with their right outcome, to measure the workflow.
              </li>
            )}
          </ul>
          {(canRun || dataset.custom) && (
            <Composer dataset={dataset} onRun={onRunCustom} onAddExample={onAddExample} disabled={running || !canRun} />
          )}
        </>
      )}
    </aside>
  )
}
