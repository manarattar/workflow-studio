// One colour per kind of step - used by the canvas, the legend, the traces and the build log.
export const KIND = {
  code: {
    label: 'Code',
    sub: 'rules & numbers',
    text: 'text-slate-200',
    chip: 'bg-slate-700/70 text-slate-100',
    border: 'border-slate-500',
    dot: 'bg-slate-400',
    hex: '#94a3b8',
  },
  jev: {
    label: 'Jev',
    sub: 'judgment calls',
    text: 'text-violet-200',
    chip: 'bg-violet-500/20 text-violet-200',
    border: 'border-violet-500',
    dot: 'bg-violet-400',
    hex: '#a78bfa',
  },
  llm: {
    label: 'LLM',
    sub: 'writing',
    text: 'text-cyan-200',
    chip: 'bg-cyan-500/20 text-cyan-200',
    border: 'border-cyan-500',
    dot: 'bg-cyan-400',
    hex: '#22d3ee',
  },
  outcome: {
    label: 'Outcome',
    sub: 'automated',
    text: 'text-emerald-200',
    chip: 'bg-emerald-500/20 text-emerald-200',
    border: 'border-emerald-500',
    dot: 'bg-emerald-400',
    hex: '#34d399',
  },
  human: {
    label: 'Human',
    sub: 'when unsure',
    text: 'text-amber-200',
    chip: 'bg-amber-500/20 text-amber-200',
    border: 'border-amber-500',
    dot: 'bg-amber-400',
    hex: '#fbbf24',
  },
}

export const NODE_KIND = { condition: 'code', decide: 'jev', write: 'llm', outcome: 'outcome' }

export const HUMAN_REVIEW = 'human_review'

export const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`)
export const usd = (x) => (x == null ? '–' : x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(3)}`)
export const humanize = (s) => (s || '').replaceAll('_', ' ')
export const seconds = (ms) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)}s`)

/** The node ids an item passed through, in order - used to light up its path. */
export const pathOf = (result) => (result ? result.steps.map((s) => s.node) : null)
