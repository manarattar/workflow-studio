import { useEffect, useState } from 'react'
import Glyph from './Glyph'
import { KIND, NODE_KIND, humanize } from '../theme'

const OPERATORS = ['>', '>=', '<', '<=', '==', '!=', 'is_empty', 'not_empty']

const input =
  'w-full rounded-[3px] border border-rule bg-paper px-2.5 py-1.5 text-[13px] text-ink focus:border-ink-2 focus:outline-none'

/**
 * Edit one step of the workflow. Text changes are checked by the server before
 * they are kept; the confidence threshold applies straight away.
 */
export default function StepEditor({ node, fields, threshold, onThreshold, onApply, onClose, onRerun, canRerun }) {
  const [draft, setDraft] = useState(node)
  const [problems, setProblems] = useState([])
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setDraft(node)
    setProblems([])
  }, [node])

  const kind = NODE_KIND[node.type]
  const k = KIND[kind]
  const changed = JSON.stringify(draft) !== JSON.stringify(node)
  const set = (patch) => setDraft({ ...draft, ...patch })

  const apply = async () => {
    setSaving(true)
    const found = await onApply(draft)
    setSaving(false)
    setProblems(found)
  }

  return (
    <div className="pointer-events-auto max-h-[calc(100vh-220px)] w-[360px] overflow-y-auto rounded-[3px] border border-rule bg-sheet p-4 shadow-[0_8px_24px_rgba(20,30,40,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <p className={`flex items-center gap-1.5 font-cond text-[11px] font-semibold uppercase tracking-[0.07em] ${k.text}`}>
          <Glyph kind={kind} /> {k.label} step
        </p>
        <button onClick={onClose} className="text-[12px] text-ink-3 hover:text-ink">Close</button>
      </div>

      <label htmlFor="se-label" className="mt-3 block text-[12px] text-ink-2">Label</label>
      <input id="se-label" value={draft.label} maxLength={60} onChange={(e) => set({ label: e.target.value })} className={input} />

      {node.type === 'decide' && (
        <>
          <label htmlFor="se-question" className="mt-3 block text-[12px] text-ink-2">Question Jev answers</label>
          <textarea id="se-question" rows={2} value={draft.question} onChange={(e) => set({ question: e.target.value })} className={`${input} resize-y`} />
          <p className="mt-3 text-[12px] text-ink-2">What each answer means (Jev decides on these descriptions)</p>
          <div className="mt-1 space-y-2">
            {Object.entries(draft.options).map(([option, meaning]) => (
              <div key={option}>
                <label htmlFor={`se-opt-${option}`} className="text-[12.5px] font-medium text-ink">{humanize(option)}</label>
                <textarea id={`se-opt-${option}`} rows={2} value={meaning}
                  onChange={(e) => set({ options: { ...draft.options, [option]: e.target.value } })} className={`${input} resize-y`} />
              </div>
            ))}
          </div>
        </>
      )}

      {node.type === 'condition' && (
        <div className="mt-3 grid grid-cols-[1fr_90px] gap-2">
          <div>
            <label htmlFor="se-field" className="block text-[12px] text-ink-2">Field</label>
            <select id="se-field" value={draft.field} onChange={(e) => set({ field: e.target.value })} className={input}>
              {Object.entries(fields).map(([f, t]) => <option key={f} value={f}>{f} ({t})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="se-op" className="block text-[12px] text-ink-2">Check</label>
            <select id="se-op" value={draft.operator} onChange={(e) => set({ operator: e.target.value })} className={`${input} num`}>
              {OPERATORS.map((op) => <option key={op} value={op}>{humanize(op)}</option>)}
            </select>
          </div>
          {!['is_empty', 'not_empty'].includes(draft.operator) && (
            <div className="col-span-2">
              <label htmlFor="se-value" className="block text-[12px] text-ink-2">Value</label>
              <input id="se-value" value={draft.value ?? ''} className={`${input} num`}
                onChange={(e) => {
                  const v = e.target.value
                  set({ value: fields[draft.field] === 'number' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v })
                }} />
            </div>
          )}
        </div>
      )}

      {node.type === 'write' && (
        <>
          <label htmlFor="se-instructions" className="mt-3 block text-[12px] text-ink-2">What the LLM should write</label>
          <textarea id="se-instructions" rows={4} value={draft.instructions}
            onChange={(e) => set({ instructions: e.target.value })} className={`${input} resize-y`} />
          <p className="mt-1 text-[11.5px] text-ink-3">It may only use the project's facts and the item itself.</p>
        </>
      )}

      {node.type === 'outcome' && (
        <p className="mt-3 text-[12.5px] text-ink-2">
          Ends in <span className="num text-ink">{node.outcome}</span>. Outcomes are set in the project, so only the label
          can change here.
        </p>
      )}

      {problems.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1 rounded-[3px] border border-human bg-human-soft px-2.5 py-2 text-[12px] text-ink">
          {problems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
      {changed && (
        <div className="mt-3 flex gap-2">
          <button onClick={apply} disabled={saving}
            className="flex-1 rounded-[3px] bg-ink px-3 py-1.5 text-[13px] font-medium text-paper hover:opacity-90 disabled:opacity-40">
            {saving ? 'Checking…' : 'Apply change'}
          </button>
          <button onClick={() => { setDraft(node); setProblems([]) }} className="rounded-[3px] border border-rule px-3 text-[13px] text-ink-2 hover:text-ink">
            Undo
          </button>
        </div>
      )}

      {node.type === 'decide' && (
        <div className="mt-4 border-t border-rule pt-3">
          <div className="flex items-baseline justify-between">
            <label htmlFor="threshold" className="text-[13px] text-ink">How sure must Jev be to act?</label>
            <span className="num text-[14px] text-jev">{Math.round(threshold * 100)}%</span>
          </div>
          <input id="threshold" type="range" min={0} max={0.9} step={0.05} value={threshold}
            onChange={(e) => onThreshold(Number(e.target.value))} className="mt-2 w-full accent-[var(--jev)]" />
          <div className="flex justify-between text-[11.5px] text-ink-3">
            <span>automate more</span>
            <span>ask a person more</span>
          </div>
        </div>
      )}
      {canRerun && (
        <button onClick={onRerun} className="mt-3 w-full rounded-[3px] border border-ink px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-paper">
          Run the inbox again
        </button>
      )}
    </div>
  )
}
