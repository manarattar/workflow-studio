import { useEffect, useRef, useState } from 'react'
import { pct, usd } from '../theme'

const EXAMPLES = {
  change: 'e.g. Send anything over €10,000 straight to the manager, before the fraud check',
  ask: 'e.g. Why did this one go to a person?',
}

function Proposal({ message, onAccept, onDiscard, busy }) {
  const { changes = [], removed = [], status, stage, problems } = message
  if (stage === 'working') {
    return (
      <p className="text-[13px] text-ink-2">
        {message.attempt > 1 ? `Fixing the draft, attempt ${message.attempt}` : 'Drafting the change'}
        <span className="ml-1 animate-pulse text-ink-3">…</span>
      </p>
    )
  }
  if (stage === 'failed') {
    return (
      <div className="text-[13px] text-ink">
        <p>That change didn't produce a valid workflow, so nothing was changed.</p>
        <ul className="mt-1 space-y-1 text-[12px] text-ink-2">
          {(problems || []).slice(0, 3).map((p, i) => <li key={i} className="border-l border-rule pl-2">{p}</li>)}
        </ul>
      </div>
    )
  }
  return (
    <div className="text-[13px] text-ink">
      <p className="text-ink-2">Proposed change{status === 'pending' ? ', shown on the canvas:' : ':'}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {changes.map((c, i) => <li key={i}>{c}</li>)}
        {removed.length > 0 && <li>Removed: {removed.join(', ')}</li>}
      </ul>
      {message.repairs > 0 && (
        <p className="mt-1 text-[12px] text-ink-3">
          The validator caught {message.repairs} problem round{message.repairs > 1 ? 's' : ''} and had them fixed first.
        </p>
      )}
      {status === 'pending' ? (
        <div className="mt-2 flex gap-2">
          <button onClick={onAccept} disabled={busy} className="rounded-[3px] bg-ink px-3 py-1 text-[13px] font-medium text-paper hover:opacity-90 disabled:opacity-40">
            Accept
          </button>
          <button onClick={onDiscard} disabled={busy} className="rounded-[3px] border border-rule px-3 py-1 text-[13px] text-ink hover:bg-paper">
            Discard
          </button>
        </div>
      ) : (
        <p className={`mt-1 text-[12px] ${status === 'accepted' ? 'text-done' : 'text-ink-3'}`}>
          {status === 'accepted' ? 'Accepted.' : 'Discarded.'}
        </p>
      )}
    </div>
  )
}

function Compare({ message }) {
  const rows = [
    ['Handled automatically', pct(message.before?.automation_rate), pct(message.after.automation_rate)],
    ['Correct when automated', pct(message.before?.accuracy_automated), pct(message.after.accuracy_automated)],
    ['Correct overall', pct(message.before?.accuracy), pct(message.after.accuracy)],
    ['Cost per run', usd(message.before?.cost_usd), usd(message.after.cost_usd)],
  ]
  return (
    <div className="text-[13px] text-ink">
      <p className="text-ink-2">Before and after the change, on the same {message.after.items} items:</p>
      <table className="num mt-1.5 w-full text-[12px]">
        <thead>
          <tr className="text-ink-3"><th className="text-left font-normal" /><th className="text-right font-normal">Before</th><th className="text-right font-normal">After</th></tr>
        </thead>
        <tbody>
          {rows.map(([label, b, a]) => (
            <tr key={label} className="border-t border-rule">
              <td className="py-1 font-sans text-ink-2">{label}</td>
              <td className="py-1 text-right text-ink-2">{b}</td>
              <td className={`py-1 text-right ${a !== b ? 'font-medium text-ink' : 'text-ink-2'}`}>{a}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Message({ message, onAccept, onDiscard, onRunCompare, busy }) {
  if (message.role === 'user') {
    return (
      <li className="ml-6 rounded-[3px] bg-paper px-3 py-2 text-[13px] text-ink">
        <p className="mb-0.5 text-[11px] text-ink-3">{message.mode === 'change' ? 'Change request' : 'Question'}{message.about ? ` · about “${message.about}”` : ''}</p>
        {message.text}
      </li>
    )
  }
  return (
    <li className="mr-4 border-l-2 border-rule pl-3">
      {message.kind === 'proposal' && <Proposal message={message} onAccept={onAccept} onDiscard={onDiscard} busy={busy} />}
      {message.kind === 'answer' && <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{message.text}</p>}
      {message.kind === 'accepted' && (
        <div className="text-[13px] text-ink">
          <p>Now the current version. Run the examples to see what the change did.</p>
          {message.canCompare && (
            <button onClick={onRunCompare} disabled={busy} className="mt-1.5 rounded-[3px] border border-ink px-3 py-1 text-[13px] font-medium text-ink hover:bg-paper disabled:opacity-40">
              Run and compare
            </button>
          )}
        </div>
      )}
      {message.kind === 'compare' && <Compare message={message} />}
      {message.kind === 'error' && <p className="text-[13px] text-bad">{message.text}</p>}
    </li>
  )
}

/**
 * Talk to the workflow: propose a change (shown on the canvas, then accepted or
 * discarded), ask why something happened, and go back to an earlier version.
 */
export default function ChatPanel({
  messages, onSend, onAccept, onDiscard, onRunCompare, busy, hasWorkflow, selectedTitle, versions, onRestore,
}) {
  const [text, setText] = useState('')
  const end = useRef(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const send = (mode) => {
    if (!text.trim()) return
    onSend(text.trim(), mode)
    setText('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="space-y-2 text-[13px] leading-relaxed text-ink-2">
            <p>Change the workflow in plain words instead of rebuilding it, or ask why an item ended where it did.</p>
            <p className="text-ink-3">
              Changes are checked like a new build and shown on the canvas before you accept them. Questions are
              answered from what actually happened, not guessed.
            </p>
          </div>
        ) : (
          <ol className="space-y-3">
            {messages.map((m, i) => (
              <Message key={i} message={m} onAccept={onAccept} onDiscard={onDiscard} onRunCompare={onRunCompare} busy={busy} />
            ))}
          </ol>
        )}
        <div ref={end} />

        {versions.length > 0 && (
          <details className="mt-5 border-t border-rule pt-3 text-[13px]">
            <summary className="cursor-pointer font-cond font-semibold text-ink-2 hover:text-ink">
              Earlier versions <span className="num font-normal text-ink-3">({versions.length})</span>
            </summary>
            <ul className="mt-2 space-y-1.5">
              {[...versions].reverse().map((v) => (
                <li key={v.at} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-ink" title={v.label}>{v.label}</p>
                    <p className="num text-[11px] text-ink-3">{new Date(v.at).toLocaleString()}</p>
                  </div>
                  <button onClick={() => onRestore(v)} disabled={busy} className="shrink-0 text-[12px] text-llm hover:underline disabled:opacity-40">
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="border-t border-rule px-5 py-3">
        {selectedTitle && (
          <p className="mb-1.5 truncate text-[12px] text-ink-3">Questions are about “{selectedTitle}”</p>
        )}
        <label htmlFor="chat-input" className="sr-only">Change request or question</label>
        <textarea
          id="chat-input"
          rows={3}
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send('change')
          }}
          placeholder={selectedTitle ? EXAMPLES.ask : EXAMPLES.change}
          className="w-full resize-none rounded-[3px] border border-rule bg-paper px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-3 focus:border-ink-2 focus:outline-none"
        />
        <div className="mt-2 flex gap-2">
          <button onClick={() => send('change')} disabled={busy || !hasWorkflow || !text.trim()}
            className="flex-1 rounded-[3px] bg-ink px-3 py-1.5 text-[13px] font-medium text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            Propose change
          </button>
          <button onClick={() => send('ask')} disabled={busy || !hasWorkflow || !text.trim()}
            className="flex-1 rounded-[3px] border border-ink px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40">
            Ask
          </button>
        </div>
        {!hasWorkflow && <p className="mt-1.5 text-[12px] text-ink-3">Build a workflow first.</p>}
      </div>
    </div>
  )
}
