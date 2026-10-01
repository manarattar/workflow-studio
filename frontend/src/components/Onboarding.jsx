import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import Glyph from './Glyph'
import { KIND } from '../theme'

const SEEN_KEY = 'routing-slip.onboarded.v1'

export function hasSeenOnboarding() {
  try {
    return localStorage.getItem(SEEN_KEY) === 'yes'
  } catch {
    return false
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, 'yes')
  } catch {
    /* storage blocked: the tour simply shows again next time */
  }
}

/**
 * The tour, in the order someone actually uses the app. Each step points at a
 * part of the screen marked with data-tour="...".
 */
const STEPS = [
  {
    target: null,
    title: 'Routing Slip turns a process into a working workflow',
    body: (
      <>
        <p>
          You describe how items should be handled, in plain words. It builds a workflow and runs it on a
          real inbox, so you can see how much it automates, how accurate it is, and what it costs.
        </p>
        <ul className="mt-3 space-y-1.5">
          {[
            ['code', 'Code handles rules and amounts, like “over €1,000”.'],
            ['jev', 'Jev, a decision model, makes judgment calls and says how sure it is.'],
            ['llm', 'An LLM only writes, for example a reply, using facts you provide.'],
            ['human', 'When Jev isn’t sure enough, a person decides.'],
          ].map(([kind, text]) => (
            <li key={kind} className="flex items-start gap-2">
              <Glyph kind={kind} className={`mt-[3px] ${KIND[kind].text}`} />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    target: 'inboxes',
    title: 'Pick a use case',
    body: 'Four sample inboxes: invoices, bank customer messages, expense claims and IT tickets. Each opens with a working workflow. Your own projects live in this menu too.',
  },
  {
    target: 'process',
    title: 'Describe the process',
    body: 'Write the rules the way you’d brief a new colleague, then press Build. Every draft is checked, and problems are sent back to the LLM to fix. The build log shows this happening.',
  },
  {
    target: 'canvas',
    title: 'The workflow',
    body: 'Each box is a step, marked by who handles it. Click any step to change it: a question, a rule, or how sure Jev must be before it acts.',
  },
  {
    target: 'inbox',
    title: 'Run it on the inbox',
    body: 'Press Run inbox and watch the items go through. Each gets a stamp with its outcome. Click one to see exactly which steps it took and why.',
  },
  {
    target: 'results',
    title: 'See how well it works',
    body: 'How many items were handled automatically, how many went to a person, how often it was right, and what the run cost.',
  },
  {
    target: 'chat',
    title: 'Change it by chatting',
    body: 'Ask for a change in plain words and it’s shown on the canvas before you accept it. Or ask why an item ended where it did.',
  },
  {
    target: 'projects',
    title: 'Bring your own process',
    body: 'Create a project from a spreadsheet of your own examples, build and measure a workflow, and publish it as an API endpoint another system can call.',
  },
]

function useTargetRect(target) {
  const [rect, setRect] = useState(null)
  const measure = useCallback(() => {
    const el = target && document.querySelector(`[data-tour="${target}"]`)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [target])
  useLayoutEffect(measure, [measure])
  useEffect(() => {
    // the panel may have just been switched in (phones show one at a time), so look again shortly
    const later = [80, 350].map((ms) => setTimeout(() => {
      const el = target && document.querySelector(`[data-tour="${target}"]`)
      if (el && el.getBoundingClientRect().top > window.innerHeight - 120) el.scrollIntoView({ block: 'center' })
      measure()
    }, ms))
    window.addEventListener('resize', measure)
    return () => { later.forEach(clearTimeout); window.removeEventListener('resize', measure) }
  }, [measure, target])
  return rect
}

/** Place the card next to the highlighted area, on whichever side has room. */
function cardPosition(rect) {
  const W = 360
  const gap = 14
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (vw < 640) return { left: 12, right: 12, bottom: 12 }
  if (!rect) return { left: Math.max(16, (vw - 440) / 2), top: Math.max(16, vh * 0.18), width: 440 }
  const clampTop = (t) => Math.min(Math.max(16, t), vh - 260)
  if (rect.right + gap + W < vw - 16) return { left: rect.right + gap, top: clampTop(rect.top + 16), width: W }
  if (rect.left - gap - W > 16) return { left: rect.left - gap - W, top: clampTop(rect.top + 16), width: W }
  const below = rect.bottom + gap
  return {
    left: Math.min(Math.max(16, rect.left), vw - W - 16),
    top: below + 220 < vh ? below : Math.max(16, rect.top - gap - 220),
    width: W,
  }
}

export default function Onboarding({ onClose, onStep }) {
  const [index, setIndex] = useState(0)
  const step = STEPS[index]
  const rect = useTargetRect(step.target)
  const last = index === STEPS.length - 1

  useEffect(() => {
    onStep?.(step.target)
  }, [step.target, onStep])

  const close = useCallback((startRun = false) => {
    markSeen()
    onClose(startRun)
  }, [onClose])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight' && !last) setIndex((i) => i + 1)
      if (e.key === 'ArrowLeft' && index > 0) setIndex((i) => i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, index, last])

  const pos = cardPosition(rect)
  const pad = 6

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        // the highlight: a transparent box whose huge shadow dims everything else
        <div
          className="pointer-events-none fixed rounded-[4px] transition-all duration-300"
          style={{
            left: rect.left - pad,
            top: rect.top - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 2px var(--ink), 0 0 0 9999px rgba(18, 24, 30, 0.55)',
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-[rgba(18,24,30,0.55)]" />
      )}

      <div
        className="fixed rounded-[3px] border border-rule bg-sheet p-5 shadow-[0_20px_60px_rgba(20,30,40,0.3)]"
        style={{ ...pos, maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto' }}
      >
        <p className="num text-[11.5px] text-ink-3">
          {index + 1} of {STEPS.length}
        </p>
        <h2 id="tour-title" className="mt-1 font-cond text-[18px] font-semibold leading-snug text-ink">
          {step.title}
        </h2>
        <div className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{step.body}</div>

        <div className="mt-4 flex items-center gap-2">
          <button onClick={() => close()} className="mr-auto text-[12.5px] text-ink-3 hover:text-ink">
            {last ? 'Close' : 'Skip the tour'}
          </button>
          {index > 0 && (
            <button onClick={() => setIndex(index - 1)} className="rounded-[3px] border border-rule px-3 py-1.5 text-[13px] text-ink hover:bg-paper">
              Back
            </button>
          )}
          <button
            autoFocus
            onClick={() => (last ? close(true) : setIndex(index + 1))}
            className="rounded-[3px] bg-ink px-4 py-1.5 text-[13px] font-medium text-paper hover:opacity-90"
          >
            {last ? 'Start with Run inbox' : index === 0 ? 'Show me around' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
