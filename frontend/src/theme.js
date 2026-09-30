// One ink per kind of step - used by the canvas, the legend, the traces and the build log.
export const KIND = {
  code: { label: 'Code', sub: 'rules and amounts', text: 'text-code', soft: 'bg-code-soft', border: 'border-code', ink: 'var(--code)' },
  jev: { label: 'Jev', sub: 'judgment calls', text: 'text-jev', soft: 'bg-jev-soft', border: 'border-jev', ink: 'var(--jev)' },
  llm: { label: 'LLM', sub: 'writing', text: 'text-llm', soft: 'bg-llm-soft', border: 'border-llm', ink: 'var(--llm)' },
  outcome: { label: 'Outcome', sub: 'done', text: 'text-done', soft: 'bg-done-soft', border: 'border-done', ink: 'var(--done)' },
  human: { label: 'Person', sub: 'when unsure', text: 'text-human', soft: 'bg-human-soft', border: 'border-human', ink: 'var(--human)' },
}

export const NODE_KIND = { condition: 'code', decide: 'jev', write: 'llm', outcome: 'outcome' }

export const HUMAN_REVIEW = 'human_review'

export const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`)
export const usd = (x) => (x == null ? '–' : x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(3)}`)
export const humanize = (s) => (s || '').replaceAll('_', ' ')
export const seconds = (ms) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)} s`)

/** The node ids an item passed through, in order - used to light up its path. */
export const pathOf = (result) => (result ? result.steps.map((s) => s.node) : null)
