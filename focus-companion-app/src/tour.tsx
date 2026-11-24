import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

// A first-run walkthrough: each step dims the room, rings one control with a dotted outline,
// and draws a dotted hand-drawn arrow from a little note to it.
export interface TourStep {
  target: string // value of the element's data-tour attribute
  title: string
  body: string
}

interface Box { top: number; left: number; width: number; height: number }

const NOTE_WIDTH = 250
const GAP = 64 // space between the note and the control the arrow points at
const EDGE = 16

function measure(target: string): Box | null {
  const element = document.querySelector(`[data-tour="${target}"]`)
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

export function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const step = steps[index]
  const isLast = index === steps.length - 1

  const next = useCallback(() => {
    if (isLast) onDone()
    else setIndex((current) => current + 1)
  }, [isLast, onDone])

  // Measure the target now and whenever the window resizes or the layout settles
  useLayoutEffect(() => {
    const update = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      setBox(measure(step.target))
    }
    update()
    const settle = window.setTimeout(update, 320)
    window.addEventListener('resize', update)
    return () => {
      window.clearTimeout(settle)
      window.removeEventListener('resize', update)
    }
  }, [step.target])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDone()
      if (event.key === 'Enter' || event.key === 'ArrowRight') next()
      if (event.key === 'ArrowLeft') setIndex((current) => Math.max(0, current - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, onDone])

  const note = (
    <>
      <p className="tour-step-count">{index + 1} of {steps.length}</p>
      <h3 id="tour-title">{step.title}</h3>
      <p className="tour-body">{step.body}</p>
      <div className="tour-actions">
        <button className="tour-skip" onClick={onDone}>Skip tour</button>
        <div className="tour-nav">
          {index > 0 && <button className="tour-back" onClick={() => setIndex(index - 1)}>Back</button>}
          <button className="tour-next" onClick={next} autoFocus>{isLast ? 'Got it!' : 'Next'}</button>
        </div>
      </div>
    </>
  )

  // Target missing (e.g. a different screen is showing): show the note centred, without an arrow
  if (!box) {
    return (
      <div className="tour-layer" role="dialog" aria-modal="true" aria-labelledby="tour-title">
        <div className="tour-note tour-note-centered" style={{ width: NOTE_WIDTH }}>{note}</div>
      </div>
    )
  }

  const centerX = box.left + box.width / 2
  const centerY = box.top + box.height / 2
  const noteAbove = centerY > viewport.height / 2
  // Nudge the note toward the middle of the window so the arrow bends a little
  const towardMiddle = centerX < viewport.width / 2 ? 40 : -40
  const noteLeft = Math.min(
    Math.max(centerX - NOTE_WIDTH / 2 + towardMiddle, EDGE),
    viewport.width - NOTE_WIDTH - EDGE,
  )
  const noteCenterX = noteLeft + NOTE_WIDTH / 2

  const start = {
    x: noteCenterX,
    y: noteAbove ? box.top - GAP : box.top + box.height + GAP,
  }
  const end = {
    x: centerX,
    y: noteAbove ? box.top - 10 : box.top + box.height + 10,
  }
  // Bow the curve sideways so it reads as a hand-drawn arrow rather than a straight line
  const bend = noteCenterX <= centerX ? 1 : -1
  const control = {
    x: (start.x + end.x) / 2 - bend * 38,
    y: (start.y + end.y) / 2,
  }

  const noteStyle = noteAbove
    ? { left: noteLeft, bottom: viewport.height - start.y + 6, width: NOTE_WIDTH }
    : { left: noteLeft, top: start.y + 6, width: NOTE_WIDTH }

  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div
        className="tour-ring"
        style={{ top: box.top - 7, left: box.left - 7, width: box.width + 14, height: box.height + 14 }}
      />
      <svg className="tour-arrow" width={viewport.width} height={viewport.height} aria-hidden="true">
        <defs>
          <marker id="tour-arrowhead" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
            <path d="M2 2L10 6L2 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        <path
          key={index}
          className="tour-arrow-path"
          d={`M${start.x} ${start.y} Q${control.x} ${control.y} ${end.x} ${end.y}`}
          markerEnd="url(#tour-arrowhead)"
        />
      </svg>
      <div className="tour-note" style={noteStyle}>{note}</div>
    </div>
  )
}
