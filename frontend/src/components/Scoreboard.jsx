import { pct, seconds, usd } from '../theme'

function Stat({ label, value, hint, tone = 'text-slate-100' }) {
  return (
    <div className="px-4 py-2">
      <p className={`font-mono text-xl font-semibold ${tone}`}>{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
      {hint && <p className="text-[10px] text-slate-600">{hint}</p>}
    </div>
  )
}

export default function Scoreboard({ summary }) {
  if (!summary) return null
  return (
    <div className="pointer-events-auto flex divide-x divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/90 shadow-2xl backdrop-blur">
      <Stat label="handled automatically" value={pct(summary.automation_rate)} tone="text-emerald-300" />
      <Stat label="sent to a person" value={summary.human_review} hint="Jev wasn't sure enough" tone="text-amber-300" />
      <Stat
        label="correct when automated"
        value={pct(summary.accuracy_automated)}
        hint="vs. reference policy"
        tone="text-sky-300"
      />
      <Stat label="total cost" value={usd(summary.cost_usd)} hint={`${summary.jev_calls} Jev · ${summary.llm_calls} LLM calls`} />
      <Stat label="for the whole inbox" value={seconds(summary.wall_ms)} hint={`${summary.items} items in parallel`} />
    </div>
  )
}
