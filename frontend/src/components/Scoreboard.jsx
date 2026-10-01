import { pct, seconds, usd } from '../theme'

function Cell({ label, value, note, tone = 'text-ink' }) {
  return (
    <div className="min-w-[148px] shrink-0 px-4 py-2.5 lg:min-w-0">
      <p className="text-[12px] text-ink-2">{label}</p>
      <p className={`num text-[20px] font-medium leading-tight ${tone}`}>{value}</p>
      <p className="truncate text-[11.5px] text-ink-3">{note}</p>
    </div>
  )
}

/** The run's result as a ledger line: always visible, filled in once the inbox has run. */
export default function Scoreboard({ summary, total, custom }) {
  const s = summary
  return (
    <div data-tour="results" className="flex divide-x divide-rule overflow-x-auto border-b border-rule bg-sheet lg:grid lg:grid-cols-5 lg:overflow-visible">
      <Cell label="Handled automatically" value={s ? pct(s.automation_rate) : '–'} note={s ? `${s.automated} of ${s.items}` : `run the ${total} items`} tone="text-done" />
      <Cell
        label="Sent to a person"
        value={s ? s.human_review : '–'}
        note={s?.jev_errors ? `${s.jev_errors} because Jev couldn't be reached` : "Jev wasn't sure enough"}
        tone="text-human"
      />
      <Cell label="Correct when automated" value={s ? pct(s.accuracy_automated) : '–'} note={custom ? "vs. your labelled examples" : "vs. reference policy"} />
      <Cell label="Cost" value={s ? usd(s.cost_usd) : '–'} note={s ? `${s.jev_calls} Jev, ${s.llm_calls} LLM calls` : 'Jev and LLM calls'} />
      <Cell label="Time" value={s ? seconds(s.wall_ms) : '–'} note="items run in parallel" />
    </div>
  )
}
