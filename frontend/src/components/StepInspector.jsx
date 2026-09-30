import { humanize } from '../theme'

/** Details of one Jev step, with the one knob that matters: how sure it must be before acting. */
export default function StepInspector({ node, threshold, onThreshold, onClose, onRerun, canRerun }) {
  return (
    <div className="pointer-events-auto w-[340px] rounded-xl border border-violet-500/40 bg-slate-950/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="rounded-md bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-200">
            Jev decision
          </span>
          <h3 className="mt-1.5 text-sm font-semibold text-slate-100">{node.label}</h3>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200">✕</button>
      </div>

      <p className="mt-2 text-xs italic text-slate-300">“{node.question}”</p>
      <ul className="mt-3 space-y-1.5">
        {Object.entries(node.options).map(([option, meaning]) => (
          <li key={option} className="text-[11px] leading-snug">
            <span className="font-semibold text-violet-200">{humanize(option)}</span>
            <span className="text-slate-400"> — {meaning}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-lg border border-slate-800 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300">How sure must Jev be to act?</span>
          <span className="font-mono text-violet-200">{Math.round(threshold * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={0.9}
          step={0.05}
          value={threshold}
          onChange={(e) => onThreshold(Number(e.target.value))}
          className="mt-2 w-full accent-violet-500"
        />
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>automate more</span>
          <span>ask a person more</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          Below this, the item goes to human review instead of following Jev's answer. It's the
          trade-off between automation and risk — the business decides it, not the model.
        </p>
      </div>
      {canRerun && (
        <button
          onClick={onRerun}
          className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500"
        >
          Re-run the inbox with this setting
        </button>
      )}
    </div>
  )
}
