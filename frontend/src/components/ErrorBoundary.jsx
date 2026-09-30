import { Component } from 'react'

/** If something in the studio breaks, say so plainly instead of leaving a blank page. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Routing Slip crashed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full items-center justify-center bg-paper px-6">
        <div className="max-w-md rounded-[3px] border border-rule bg-sheet p-6">
          <h1 className="font-cond text-[19px] font-semibold text-ink">Something went wrong</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
            The page hit an error and stopped. Your own projects are saved in this browser, so reloading
            is safe.
          </p>
          <p className="num mt-3 rounded-[3px] bg-paper px-2.5 py-2 text-[12px] text-ink-3">{String(this.state.error.message || this.state.error)}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-[3px] bg-ink px-4 py-2 text-[14px] font-medium text-paper hover:opacity-90"
          >
            Reload the page
          </button>
        </div>
      </div>
    )
  }
}
