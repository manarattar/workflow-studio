import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { newProjectId } from '../projects'

const MAX_ITEMS = 50
const ROLES = [
  ['text', 'Text field'],
  ['number', 'Number field'],
  ['outcome', 'Right outcome'],
  ['ignore', 'Ignore'],
]

/** "Invoice Amount (€)" -> "invoice_amount"; must match the API's field-name rule. */
function snake(name, taken) {
  let s = String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!s || /^[0-9]/.test(s)) s = `f_${s || 'field'}`
  if (s === 'id' || s === 'expected') s = `${s}_value`
  s = s.slice(0, 40)
  let out = s
  for (let i = 2; taken?.has(out); i++) out = `${s}_${i}`
  return out
}

function guessRole(column, rows) {
  if (/outcome|label|category|decision|result|expected|route|class/i.test(column)) return 'outcome'
  const values = rows.map((r) => String(r[column] ?? '').trim()).filter(Boolean)
  if (values.length && values.every((v) => !Number.isNaN(Number(v.replace(',', '.'))))) return 'number'
  return 'text'
}

function parse(input, onDone, onError) {
  Papa.parse(input, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
    complete: (result) => {
      const columns = (result.meta.fields || []).filter(Boolean)
      if (!columns.length || !result.data.length) onError('No rows found. The first row must hold the column names.')
      else onDone(columns, result.data)
    },
    error: (e) => onError(`Couldn't read that: ${e.message}`),
  })
}

export default function NewProject({ onCreate, onCancel, checkSpec }) {
  const [name, setName] = useState('')
  const [source, setSource] = useState('csv')
  const [pasted, setPasted] = useState('')
  const [columns, setColumns] = useState([])
  const [rows, setRows] = useState([])
  const [roles, setRoles] = useState({})
  const [meanings, setMeanings] = useState({})
  const [extraOutcomes, setExtraOutcomes] = useState([])
  const [newOutcome, setNewOutcome] = useState('')
  const [facts, setFacts] = useState('')
  const [notice, setNotice] = useState(null)
  const [problems, setProblems] = useState([])
  const [saving, setSaving] = useState(false)

  const load = (cols, data) => {
    setColumns(cols)
    setRows(data.slice(0, MAX_ITEMS))
    setRoles(Object.fromEntries(cols.map((c) => [c, guessRole(c, data)])))
    setNotice(data.length > MAX_ITEMS ? `Kept the first ${MAX_ITEMS} of ${data.length} rows.` : `${data.length} rows read.`)
  }

  // field names as the API will see them, unique and in column order
  const fieldNames = useMemo(() => {
    const taken = new Set()
    return Object.fromEntries(
      columns.map((c) => {
        const n = snake(c, taken)
        taken.add(n)
        return [c, n]
      }),
    )
  }, [columns])

  const outcomeColumn = columns.find((c) => roles[c] === 'outcome')
  const outcomeNames = useMemo(() => {
    const fromData = outcomeColumn
      ? [...new Set(rows.map((r) => String(r[outcomeColumn] ?? '').trim()).filter(Boolean).map((v) => snake(v)))]
      : []
    return [...new Set([...fromData, ...extraOutcomes])]
  }, [rows, outcomeColumn, extraOutcomes])

  const build = () => {
    const fields = Object.fromEntries(
      columns.filter((c) => roles[c] === 'text' || roles[c] === 'number').map((c) => [fieldNames[c], roles[c]]),
    )
    const items = rows.map((r) => {
      const item = {}
      columns.forEach((c) => {
        if (roles[c] === 'text') item[fieldNames[c]] = String(r[c] ?? '')
        if (roles[c] === 'number') {
          const v = String(r[c] ?? '').trim().replace(',', '.')
          item[fieldNames[c]] = v === '' ? null : Number(v)
        }
      })
      if (outcomeColumn && String(r[outcomeColumn] ?? '').trim()) item.expected = snake(String(r[outcomeColumn]).trim())
      return item
    })
    return {
      id: newProjectId(),
      name: name.trim() || 'Untitled project',
      fields,
      outcomes: Object.fromEntries(outcomeNames.map((o) => [o, (meanings[o] || '').trim()])),
      knowledge: facts.split('\n').map((f) => f.trim()).filter(Boolean),
      items,
      description: '',
      workflow: null,
      thresholds: {},
      published: null,
    }
  }

  const create = async () => {
    const project = build()
    const missing = outcomeNames.filter((o) => !(meanings[o] || '').trim())
    if (missing.length) {
      setProblems([`Describe what each outcome means: ${missing.join(', ')}.`])
      return
    }
    setSaving(true)
    const found = await checkSpec(project)
    setSaving(false)
    if (found.length) setProblems(found)
    else onCreate(project)
  }

  const input =
    'w-full rounded-[3px] border border-rule bg-paper px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-ink-2 focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-ink/30 px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="np-title">
      <div className="h-fit w-full max-w-3xl rounded-[3px] border border-rule bg-sheet shadow-[0_20px_60px_rgba(20,30,40,0.25)]">
        <div className="flex items-start justify-between border-b border-rule px-6 py-4">
          <div>
            <h2 id="np-title" className="font-cond text-[19px] font-semibold text-ink">New project</h2>
            <p className="mt-0.5 text-[13px] text-ink-2">
              Bring a sample of your client's inbox. Items stay in this browser; nothing is stored on the server.
            </p>
          </div>
          <button onClick={onCancel} className="text-[13px] text-ink-3 hover:text-ink">Cancel</button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <section>
            <label htmlFor="np-name" className="font-cond text-[14px] font-semibold text-ink">Name</label>
            <input id="np-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
              placeholder="e.g. Acme leave requests" className={`${input} mt-1.5`} />
          </section>

          <section>
            <h3 className="font-cond text-[14px] font-semibold text-ink">Example items</h3>
            <p className="mt-0.5 text-[12.5px] text-ink-2">
              One row per item, column names in the first row. A column with the right outcome lets every run
              report accuracy. Up to {MAX_ITEMS} rows.
            </p>
            <div className="mt-2 flex gap-4 border-b border-rule text-[13px]">
              {[['csv', 'Upload CSV'], ['paste', 'Paste rows']].map(([k, label]) => (
                <button key={k} onClick={() => setSource(k)}
                  className={`-mb-px border-b-2 pb-1.5 ${source === k ? 'border-ink text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}>
                  {label}
                </button>
              ))}
            </div>
            {source === 'csv' ? (
              <input id="np-file" type="file" accept=".csv,.tsv,text/csv,text/plain" className="mt-3 text-[13px] text-ink-2"
                onChange={(e) => e.target.files?.[0] && parse(e.target.files[0], load, (m) => setNotice(m))} />
            ) : (
              <div className="mt-3 space-y-2">
                <textarea id="np-paste" rows={5} value={pasted} onChange={(e) => setPasted(e.target.value)}
                  placeholder={'employee\tmessage\tdays\toutcome\nSam\tTwo days off next week\t2\tapprove'}
                  className={`${input} num resize-y`} />
                <button onClick={() => parse(pasted, load, (m) => setNotice(m))} disabled={!pasted.trim()}
                  className="rounded-[3px] border border-ink px-3 py-1 text-[13px] text-ink hover:bg-paper disabled:opacity-40">
                  Read rows
                </button>
                <p className="text-[12px] text-ink-3">Copy cells from a spreadsheet and paste them here, or type comma-separated rows.</p>
              </div>
            )}
            {notice && <p className="mt-2 text-[12.5px] text-ink-2">{notice}</p>}

            {columns.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-[3px] border border-rule">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="bg-paper">
                    <tr>
                      {columns.map((c) => (
                        <th key={c} className="min-w-[140px] border-b border-rule px-2.5 py-2 align-top font-normal">
                          <p className="font-medium text-ink">{c}</p>
                          <select id={`np-role-${fieldNames[c]}`} value={roles[c]} aria-label={`What ${c} is`}
                            onChange={(e) => setRoles({ ...roles, [c]: e.target.value })}
                            className="mt-1 w-full rounded-[3px] border border-rule bg-sheet px-1.5 py-1 text-[12px] text-ink">
                            {ROLES.map(([v, label]) => (
                              <option key={v} value={v} disabled={v === 'outcome' && outcomeColumn && outcomeColumn !== c}>{label}</option>
                            ))}
                          </select>
                          {(roles[c] === 'text' || roles[c] === 'number') && (
                            <p className="num mt-1 text-[11px] text-ink-3">{fieldNames[c]}</p>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 4).map((r, i) => (
                      <tr key={i} className="border-b border-rule last:border-0">
                        {columns.map((c) => (
                          <td key={c} className={`max-w-[220px] truncate px-2.5 py-1.5 ${roles[c] === 'ignore' ? 'text-ink-3 line-through' : 'text-ink-2'}`}>
                            {String(r[c] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 4 && <p className="bg-paper px-2.5 py-1.5 text-[12px] text-ink-3">and {rows.length - 4} more rows</p>}
              </div>
            )}
          </section>

          <section>
            <h3 className="font-cond text-[14px] font-semibold text-ink">Outcomes</h3>
            <p className="mt-0.5 text-[12.5px] text-ink-2">
              Where an item can end up. Describe each one plainly: the workflow is built from these descriptions.
              Unsure items always go to a person, so there's no need to add that.
            </p>
            <ul className="mt-2 space-y-2">
              {outcomeNames.map((o) => (
                <li key={o} className="grid grid-cols-[160px_1fr_auto] items-center gap-2">
                  <span className="num truncate text-[12.5px] text-ink">{o}</span>
                  <input id={`np-meaning-${o}`} aria-label={`What ${o} means`} value={meanings[o] || ''}
                    onChange={(e) => setMeanings({ ...meanings, [o]: e.target.value })} maxLength={300}
                    placeholder="What this outcome means" className={input} />
                  {extraOutcomes.includes(o) ? (
                    <button onClick={() => setExtraOutcomes(extraOutcomes.filter((x) => x !== o))} className="text-[12px] text-ink-3 hover:text-ink">Remove</button>
                  ) : <span className="text-[11px] text-ink-3">from data</span>}
                </li>
              ))}
            </ul>
            <form className="mt-2 flex gap-2" onSubmit={(e) => {
              e.preventDefault()
              const o = snake(newOutcome)
              if (newOutcome.trim() && !outcomeNames.includes(o)) setExtraOutcomes([...extraOutcomes, o])
              setNewOutcome('')
            }}>
              <input id="np-new-outcome" aria-label="New outcome name" value={newOutcome} onChange={(e) => setNewOutcome(e.target.value)}
                placeholder="Add an outcome, e.g. approve" className={`${input} max-w-[240px]`} />
              <button type="submit" className="rounded-[3px] border border-rule px-3 text-[13px] text-ink hover:bg-paper">Add</button>
            </form>
          </section>

          <section>
            <label htmlFor="np-facts" className="font-cond text-[14px] font-semibold text-ink">Facts the LLM may use</label>
            <p className="mt-0.5 text-[12.5px] text-ink-2">Optional. One per line: opening hours, policies, contact details. Drafts may only use these.</p>
            <textarea id="np-facts" rows={3} value={facts} onChange={(e) => setFacts(e.target.value)}
              placeholder="Employees have 25 leave days per year." className={`${input} mt-1.5 resize-y`} />
          </section>

          {problems.length > 0 && (
            <ul role="alert" className="space-y-1 rounded-[3px] border border-human bg-human-soft px-3 py-2 text-[12.5px] text-ink">
              {problems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-rule px-6 py-4">
          <p className="mr-auto text-[12px] text-ink-3">
            {Object.values(roles).filter((r) => r === 'text' || r === 'number').length} fields · {outcomeNames.length} outcomes · {rows.length} items
          </p>
          <button onClick={onCancel} className="text-[13px] text-ink-2 hover:text-ink">Cancel</button>
          <button onClick={create} disabled={saving || outcomeNames.length < 2 || !Object.values(roles).some((r) => r === 'text' || r === 'number')}
            className="rounded-[3px] bg-ink px-4 py-2 text-[14px] font-medium text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? 'Checking…' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  )
}
