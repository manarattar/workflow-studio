/**
 * Process-map glyphs, one per kind of step: a code bracket, a gateway diamond
 * for a decision, a pen for writing, a tray for an outcome, a person for review.
 */
const PATHS = {
  code: <path d="M5.5 3.5 2.5 8l3 4.5M10.5 3.5l3 4.5-3 4.5" />,
  jev: <path d="M8 1.8 14.2 8 8 14.2 1.8 8Z" />,
  llm: <path d="M10.8 2.4 13.6 5.2 6 12.8l-3.6.8.8-3.6ZM9.4 3.8l2.8 2.8" />,
  outcome: <path d="M2 9.2h3.2l1 1.8h3.6l1-1.8H14M2 9.2 3.6 3.5h8.8L14 9.2V13H2Z" />,
  human: <path d="M8 7.4a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 14c0-2.8 2.2-4.6 5-4.6s5 1.8 5 4.6" />,
}

export default function Glyph({ kind, className = '' }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[kind]}
    </svg>
  )
}
