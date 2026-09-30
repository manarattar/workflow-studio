import Glyph from './Glyph'
import { humanize } from '../theme'

/** One Jev step: its question, its options, and how sure it must be before acting. */
export default function StepInspector({ node, threshold, onThreshold, onClose, onRerun, canRerun }) {
  return (
    <div className="pointer-events-auto w-[340px] rounded-[3px] border border-rule bg-sheet p-4 shadow-[0_8px_24px_rgba(20,30,40,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 font-cond text-[11px] font-semibold uppercase tracking-[0.07em] text-jev">
            <Glyph kind="jev" /> Jev decision
          </p>
          <h3 className="mt-1 text-[15px] font-medium text-ink">{node.label}</h3>
        </div>
        <button onClick={onClose} className="text-[12px] text-ink-3 hover:text-ink">Close</button>
      </div>

      <p className="mt-2 text-[13px] text-ink-2">{node.question}</p>
      <dl className="mt-3 space-y-2">
        {Object.entries(node.options).map(([option, meaning]) => (
          <div key={option} className="text-[12.5px] leading-snug">
            <dt className="font-medium text-ink">{humanize(option)}</dt>
            <dd className="text-ink-2">{meaning}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 border-t border-rule pt-3">
        <div className="flex items-baseline justify-between">
          <label htmlFor="threshold" className="text-[13px] text-ink">How sure must Jev be to act?</label>
          <span className="num text-[14px] text-jev">{Math.round(threshold * 100)}%</span>
        </div>
        <input
          id="threshold"
          type="range"
          min={0}
          max={0.9}
          step={0.05}
          value={threshold}
          onChange={(e) => onThreshold(Number(e.target.value))}
          className="mt-2 w-full accent-[var(--jev)]"
        />
        <div className="flex justify-between text-[11.5px] text-ink-3">
          <span>automate more</span>
          <span>ask a person more</span>
        </div>
        <p className="mt-2 text-[12px] leading-snug text-ink-3">
          Below this, the item goes to a person instead of following Jev's answer. It trades automation
          against risk, and the business sets it.
        </p>
      </div>
      {canRerun && (
        <button
          onClick={onRerun}
          className="mt-3 w-full rounded-[3px] bg-ink px-3 py-2 text-[13px] font-medium text-paper hover:opacity-90"
        >
          Run the inbox again
        </button>
      )}
    </div>
  )
}
