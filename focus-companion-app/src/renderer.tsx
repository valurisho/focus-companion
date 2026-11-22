import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { supabase } from './utils/supabase'
import { BUDDY_NAME_MAX_LENGTH, BuddyAvatar, OnboardingFlow, type BuddyLook, type UserProfile } from './onboarding'
import topHatArtwork from '../assets/accessories/top-hat.svg'
import starlightWizardHatArtwork from '../assets/accessories/starlight-wizard-hat.svg'
import cloudHatArtwork from '../assets/accessories/cloud-hat.svg'

type ModalName = 'duration' | 'settings' | 'closet' | null
type ClosetPage = 'grid' | 'try-on'

interface ClosetAccessory {
  id: string
  name: string
  description: string
  is_active: boolean
  slot: string
  icon: string
  unlock_sessions: number
  sort_order: number
}

interface OwnedAccessory {
  accessory_id: string
  unlocked_at: string
  is_equipped: boolean
}

const hourOptions = [0, 1, 2, 3, 4]
const minuteOptions = Array.from({ length: 12 }, (_, index) => index * 5)
const wheelRowHeight = 48

function WheelColumn({
  label,
  unit,
  values,
  value,
  onChange,
}: {
  label: string
  unit: string
  values: number[]
  value: number
  onChange: (value: number) => void
}) {
  const wheelRef = useRef<HTMLDivElement>(null)
  const settleTimeout = useRef<number | null>(null)

  useEffect(() => {
    const wheel = wheelRef.current
    if (!wheel) return
    wheel.scrollTop = values.indexOf(value) * wheelRowHeight
  }, [])

  useEffect(() => () => {
    if (settleTimeout.current !== null) window.clearTimeout(settleTimeout.current)
  }, [])

  const selectValue = (index: number) => {
    const safeIndex = Math.max(0, Math.min(values.length - 1, index))
    onChange(values[safeIndex])
    wheelRef.current?.scrollTo({ top: safeIndex * wheelRowHeight, behavior: 'smooth' })
  }

  const settleScroll = () => {
    if (settleTimeout.current !== null) window.clearTimeout(settleTimeout.current)
    settleTimeout.current = window.setTimeout(() => {
      const wheel = wheelRef.current
      if (!wheel) return
      const index = Math.max(0, Math.min(values.length - 1, Math.round(wheel.scrollTop / wheelRowHeight)))
      onChange(values[index])
    }, 90)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    selectValue(values.indexOf(value) + (event.key === 'ArrowDown' ? 1 : -1))
  }

  return (
    <div className={`wheel-column ${unit === 'hr' ? 'hours-column' : 'minutes-column'}`}>
      <div
        ref={wheelRef}
        className="wheel-viewport"
        role="listbox"
        aria-label={label}
        tabIndex={0}
        onScroll={settleScroll}
        onKeyDown={handleKeyDown}
      >
        {values.map((option, index) => (
          <button
            className={`wheel-option ${option === value ? 'selected' : ''}`}
            key={option}
            type="button"
            role="option"
            aria-selected={option === value}
            tabIndex={-1}
            onClick={() => selectValue(index)}
          >
            {String(option).padStart(2, '0')}
          </button>
        ))}
      </div>
      <span className="wheel-unit" aria-hidden="true">{unit}</span>
    </div>
  )
}

function formatDuration(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h > 0 && m > 0) return `${h} hr ${m} min`
  if (h > 0) return `${h} hr`
  return `${m} min`
}

function formatTime(seconds: number, durationMinutes = 0, includeSeconds = true) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  if (!includeSeconds) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }
  if (durationMinutes >= 60) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function useTimerSnapshot() {
  const [snapshot, setSnapshot] = useState<TimerSnapshot>({
    status: 'ready',
    mode: 'focus',
    durationMinutes: 20,
    remainingSeconds: 20 * 60,
  })

  useEffect(() => {
    let active = true
    const unsubscribe = window.focusCompanion.onTimerUpdate((nextSnapshot) => {
      if (active) setSnapshot(nextSnapshot)
    })

    window.focusCompanion.getTimerState().then((nextSnapshot) => {
      if (active) setSnapshot(nextSnapshot)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return snapshot
}

const CONFETTI_COLORS = ['#84a187', '#d88e73', '#d4a54f', '#708472', '#fffefa', '#f5e4d9', '#c9a56e']

function Confetti() {
  const [alive, setAlive] = useState(true)

  useEffect(() => {
    const t = window.setTimeout(() => setAlive(false), 1400)
    return () => window.clearTimeout(t)
  }, [])

  if (!alive) return null

  return (
    <div className="popup-confetti" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <span
          key={i}
          className="popup-confetti-piece"
          style={{
            left: `${8 + (i * 61 + 17) % 84}%`,
            animationDelay: `${(i * 97) % 350}ms`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          }}
        />
      ))}
    </div>
  )
}

function TimerPopup() {
  const timer = useTimerSnapshot()
  const [confettiKey, setConfettiKey] = useState(0)
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    const unsubscribe = window.focusCompanion.onCelebration(() => {
      setConfettiKey((k) => k + 1)
      setShowConfetti(true)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (timer.status !== 'complete') setShowConfetti(false)
  }, [timer.status])

  const isFocusComplete = timer.mode === 'focus' && timer.status === 'complete'

  const statusLabel = timer.mode === 'break'
    ? timer.status === 'complete' ? 'BREAK COMPLETE' : timer.status === 'paused' ? 'BREAK PAUSED' : 'BREAK TIME'
    : timer.status === 'running'
      ? 'FOCUSING'
      : timer.status === 'paused'
        ? 'PAUSED'
        : timer.status === 'complete'
          ? 'SESSION COMPLETE'
          : "TOMO'S NOOK"

  return (
    <main className="timer-popup-screen" aria-label="Tomo's Nook timer">
      {showConfetti && <Confetti key={confettiKey} />}
      <button className="timer-popup-quit" onClick={() => { void window.focusCompanion.hidePopup() }} aria-label="Close timer popup">
        ×
      </button>
      {isFocusComplete ? (
        <>
          <span className="timer-popup-status complete">
            <span className="status-dot" />
            {statusLabel}
          </span>
          <p className="timer-popup-celebration-title">Nice work!</p>
          <p className="timer-popup-celebration-copy">Focus session complete</p>
          <button className="timer-popup-open-app" onClick={() => { void window.focusCompanion.showMainWindow() }}>
            Open Tomo's Nook
          </button>
        </>
      ) : (
        <>
          <span className={`timer-popup-status ${timer.status}`}>
            <span className="status-dot" />
            {statusLabel}
          </span>
          <div className="timer-popup-time" role="timer" aria-label={`${formatTime(timer.remainingSeconds, timer.durationMinutes, timer.status !== 'ready')} remaining`}>
            {formatTime(timer.remainingSeconds, timer.durationMinutes, timer.status !== 'ready')}
          </div>
          <button className="timer-popup-quit-app" onClick={() => { void window.focusCompanion.quitApp() }}>
            Quit Tomo's Nook
          </button>
        </>
      )}
    </main>
  )
}

function DesktopPet() {
  const [appearance, setAppearance] = useState<DesktopPetAppearance>({
    buddyName: 'Tomo',
    look: 'blob',
    accessory: null,
  })

  useEffect(() => {
    document.documentElement.classList.add('desktop-pet-window')
    document.body.classList.add('desktop-pet-window')
    let active = true
    const unsubscribe = window.focusCompanion.onDesktopPetAppearance(setAppearance)
    void window.focusCompanion.getDesktopPetAppearance().then((current) => {
      if (active) setAppearance(current)
    })
    return () => {
      active = false
      unsubscribe()
      document.documentElement.classList.remove('desktop-pet-window')
      document.body.classList.remove('desktop-pet-window')
    }
  }, [])

  return (
    <main className="desktop-pet-screen" aria-label={`${appearance.buddyName}'s desktop companion`}>
      <button
        className="desktop-pet-hide"
        aria-label="Hide desktop buddy"
        title="Hide buddy"
        onClick={() => { void window.focusCompanion.closeDesktopPet() }}
      >
        ×
      </button>
      <div className="desktop-pet-avatar-drag" role="img" aria-label={appearance.buddyName}>
        <BuddyAvatar look={appearance.look} className="desktop-pet-avatar" />
        {appearance.accessory && (
          <span className="desktop-pet-accessory-icon" aria-hidden="true">
            {appearance.accessory.icon}
          </span>
        )}
      </div>
    </main>
  )
}

function BuddyScene({ look, buddyName, accessory, showBook = false, nightMode, closetOpen, onToggleNightMode, onEditName, onOpenCloset }: { look: BuddyLook; buddyName: string; accessory?: ClosetAccessory; showBook?: boolean; nightMode: boolean; closetOpen: boolean; onToggleNightMode: () => void; onEditName: () => void; onOpenCloset: () => void }) {
  // The wardrobe door swings open first, then the closet dialog appears; it closes again with the dialog
  const [doorOpening, setDoorOpening] = useState(false)
  const openTimeout = useRef<number | null>(null)
  const wardrobeOpen = doorOpening || closetOpen
  useEffect(() => {
    if (!closetOpen) setDoorOpening(false)
  }, [closetOpen])
  useEffect(() => () => {
    if (openTimeout.current !== null) window.clearTimeout(openTimeout.current)
  }, [])
  const openWardrobe = () => {
    if (wardrobeOpen) return
    setDoorOpening(true)
    openTimeout.current = window.setTimeout(onOpenCloset, 280)
  }

  // The name pillow grows with the name and leans on the right arm of the couch.
  // Names saved before the 10-character limit are cut short here so they still fit.
  const pillowName = buddyName.slice(0, BUDDY_NAME_MAX_LENGTH)
  const pillowWidth = Math.min(104, Math.max(66, pillowName.length * 10 + 28))
  const pillowFontSize = pillowName.length > 8 ? 19 - (pillowName.length - 8) : 19
  const pillowX = 414
  const pillowCenterX = pillowX + pillowWidth / 2
  return (
    <svg
      className="buddy-scene"
      viewBox="0 0 640 300"
      role="group"
      aria-labelledby="buddy-scene-title"
      preserveAspectRatio="xMidYMax slice"
    >
      <title id="buddy-scene-title">Your study buddy relaxing on a sofa</title>
      <defs>
        {/* Wobbles straight edges so shapes look drawn by hand */}
        <filter id="scene-hand-drawn" x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="wobble" />
          <feDisplacementMap in="SourceGraphic" in2="wobble" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {/* Rougher displacement gives the rug a soft, woolly edge */}
        <filter id="scene-fuzzy" x="-6%" y="-30%" width="112%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="11" result="fuzz" />
          <feDisplacementMap in="SourceGraphic" in2="fuzz" scale="7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>


      <g transform="translate(418 20) scale(0.7) translate(-34 -33)">
      <g className="scene-window" filter="url(#scene-hand-drawn)">
        <rect className="window-pane" x="46" y="38" width="154" height="88" rx="3" />
        {!nightMode && <path className="window-cloud" d="M64 70q2-11 13-9 5-8 14-3 10-2 11 8 7 1 6 8H63q-6-1 1-4z" />}
        {nightMode && <g className="scene-night-sky" aria-hidden="true">
          <path d="M78 54a17 17 0 1 0 20 22A19 19 0 0 1 78 54z" />
          <circle cx="124" cy="54" r="2" /><circle cx="112" cy="95" r="1.7" /><circle cx="172" cy="104" r="1.8" />
          <path d="m132 77 1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" />
          <path d="m176 56 1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" />
        </g>}
        <path className="window-bars" d="M123 40v84M48 82h150" />
        <rect className="window-frame" x="46" y="38" width="154" height="88" rx="3" />
        <rect className="window-outline" x="41" y="33" width="164" height="98" rx="5" />
        <path className="window-sill" d="M34 131h178l-5 9H39z" />
      </g>
      </g>

      <g filter="url(#scene-hand-drawn)">
        <path className="scene-skirting" d="M-20 233h680v11H-20z" />
        <path className="scene-floor-shade" d="M-20 244h680v7H-20z" />
      </g>

      <g className="scene-rug" aria-hidden="true">
        <g filter="url(#scene-fuzzy)">
          <ellipse className="rug-base" cx="346" cy="268" rx="226" ry="27" />
        </g>
        <ellipse className="rug-inner" cx="346" cy="268" rx="194" ry="18" />
        <path className="rug-fringe" d="M120 262l-9-2m8 7-10 1m11 4-9 4M572 262l9-2m-8 7 10 1m-11 4 9 4" />
      </g>

      <g
        className={`scene-lamp ${nightMode ? 'is-on' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={nightMode ? 'Turn on daytime mode' : 'Turn on night mode'}
        aria-pressed={nightMode}
        onClick={onToggleNightMode}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggleNightMode()
          }
        }}
      >
        <rect className="lamp-hit" x="520" y="60" width="106" height="196" />
        <g filter="url(#scene-hand-drawn)">
          <path className="lamp-pole" d="M572 124V244" />
          <path className="lamp-pole-line" d="M569 128V242" />
          <ellipse className="lamp-base" cx="572" cy="246" rx="21" ry="6" />
          <path className="lamp-pull" d="M590 124v26" />
          <circle className="lamp-pull-knob" cx="590" cy="153" r="3.5" />
          <path className="lamp-shade" d="M546 70h52l20 54h-92z" />
          <path className="lamp-pleats" d="M555 72l-14 50M564 72l-8 50M572 72v50M580 72l8 50M589 72l14 50" />
        </g>
      </g>

      {/* Wardrobe behind the couch: the left door swings open a little on hover and wide on click, then the closet opens */}
      <g
        className={`scene-wardrobe ${wardrobeOpen ? 'is-open' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Open closet"
        onClick={openWardrobe}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openWardrobe()
          }
        }}
      >
        <title>Open closet</title>
        <g filter="url(#scene-hand-drawn)">
          <path className="wardrobe-wood" d="M112 78Q112 60 138 56Q186 30 234 56Q260 60 260 78Z" />
          <path className="wardrobe-trim" d="M164 62q22-12 44 0" />
          <circle className="wardrobe-knob" cx="186" cy="52" r="3.2" />
          <rect className="wardrobe-wood" x="118" y="76" width="136" height="148" rx="3" />
          <rect className="wardrobe-inside" x="124" y="82" width="62" height="136" />
          <g className="wardrobe-dots">
            <circle cx="134" cy="112" r="3" /><circle cx="176" cy="122" r="3" /><circle cx="132" cy="164" r="3" />
            <circle cx="178" cy="176" r="3" /><circle cx="140" cy="204" r="3" /><circle cx="172" cy="206" r="3" />
          </g>
          <path className="wardrobe-rod" d="M126 96h58" />
          <rect className="wardrobe-wood door-right" x="186" y="82" width="62" height="136" rx="2" />
          <path className="wardrobe-mirror" d="M194 102q0-12 23-14 23 2 23 14v102h-46z" />
          <circle className="wardrobe-knob" cx="191" cy="152" r="2.6" />
          <rect className="wardrobe-wood" x="112" y="222" width="148" height="12" rx="3" />
          <path className="wardrobe-wood" d="M120 234q0 8 6 10h9q-4-4-4-10zM252 234q0 8-6 10h-9q4-4 4-10z" />
        </g>
        <g className="wardrobe-door">
          <g filter="url(#scene-hand-drawn)">
            <rect className="wardrobe-wood door-left" x="124" y="82" width="62" height="136" rx="2" />
            <rect className="wardrobe-panel" x="132" y="92" width="46" height="54" rx="3" />
            <rect className="wardrobe-panel" x="132" y="154" width="46" height="54" rx="3" />
            <circle className="wardrobe-knob" cx="181" cy="152" r="2.6" />
          </g>
        </g>
      </g>

      <g className="scene-plant" transform="translate(-10 0)" filter="url(#scene-hand-drawn)" aria-hidden="true">
        <path className="plant-leaf" d="M86 212q-26-14-30-42 22 8 30 42z" />
        <path className="plant-leaf light" d="M90 210q-4-40 14-58 10 30-14 58z" />
        <path className="plant-leaf" d="M94 213q14-28 40-30-8 26-40 30z" />
        <path className="plant-leaf light" d="M88 214q-22-2-36-18 22-4 36 18z" />
        <path className="plant-pot" d="M70 210h40l-5 40H75z" />
        <path className="plant-pot" d="M66 205h48v9H66z" />
      </g>

      <ellipse className="scene-shadow" cx="360" cy="258" rx="146" ry="11" />
      {/* Puffy tufted couch with rounded arms and a scalloped skirt, set right so the wardrobe peeks out behind it */}
      <g className="scene-sofa" filter="url(#scene-hand-drawn)">
        <path d="M251.2 178V142Q251.2 113 275.2 111Q304 99 334.4 108Q360 97 385.6 108Q416 99 444.8 111Q468.8 113 468.8 142V178Z" />
        <circle className="sofa-tuft" cx="305.6" cy="140" r="2.8" />
        <circle className="sofa-tuft" cx="360" cy="134" r="2.8" />
        <circle className="sofa-tuft" cx="414.4" cy="140" r="2.8" />
        <path className="sofa-cushion" d="M256 170Q360 160 464 170Q468.8 171 468.8 178V224H251.2V178Q251.2 171 256 170Z" />
        <path className="sofa-seam" d="M260.8 186Q360 179 459.2 186" />
        <path className="sofa-skirt" d="M228.8 222H491.2V236Q481.8 252 472.5 236Q463.1 252 453.7 236Q444.3 252 435 236Q425.6 252 416.2 236Q406.9 252 397.5 236Q388.1 252 378.7 236Q369.4 252 360 236Q350.6 252 341.3 236Q331.9 252 322.5 236Q313.1 252 303.8 236Q294.4 252 285 236Q275.7 252 266.3 236Q256.9 252 247.5 236Q238.2 252 228.8 236Z" />
        <path className="sofa-pleats" d="M247.5 226v9M266.3 226v9M285 226v9M303.8 226v9M322.5 226v9M341.3 226v9M360 226v9M378.7 226v9M397.5 226v9M416.2 226v9M435 226v9M453.7 226v9M472.5 226v9" />
        <path d="M224 232Q220.8 190 225.6 162Q228.8 142 244.8 141Q262.4 142 265.6 162Q268.8 194 265.6 232Q244.8 240 224 232Z" />
        <path d="M496 232Q499.2 190 494.4 162Q491.2 142 475.2 141Q457.6 142 454.4 162Q451.2 194 454.4 232Q475.2 240 496 232Z" />
      </g>
      <g
        className="scene-pillow"
        transform={`rotate(7 ${pillowCenterX} 154)`}
        role="button"
        tabIndex={0}
        aria-label={`Rename ${pillowName}`}
        onClick={onEditName}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onEditName()
          }
        }}
      >
        <title>Rename {pillowName}</title>
        <rect className="pillow-body" x={pillowX} y="131" width={pillowWidth} height="46" rx="15" filter="url(#scene-hand-drawn)" />
        <rect className="pillow-stitch" x={pillowX + 6} y="137" width={pillowWidth - 12} height="34" rx="10" />
        <text className="pillow-name" x={pillowCenterX} y="155" fontSize={pillowFontSize} textAnchor="middle" dominantBaseline="central">{pillowName}</text>
      </g>
      <g transform="translate(40 0)">
      <g className="scene-buddy" filter="url(#scene-hand-drawn)">
        {look === 'cat' && <path d="m270 118 7-35 27 23m28 0 27-23 7 35" />}
        {look === 'owl' && <path d="M274 119q3-25 18-22m56 0q15-3 18 22" />}
        <path d="M263 171c3-56 22-83 57-83s54 27 57 83z" />
        {look === 'owl' ? <>
          <circle className="owl-eye-ring" cx="300" cy="139" r="11" />
          <circle className="owl-eye-ring" cx="340" cy="139" r="11" />
          <path className="owl-beak" d="m320 145 5 7h-10z" />
        </> : <>
          <ellipse cx="300" cy="139" rx="5.5" ry="6.5" />
          <ellipse cx="340" cy="139" rx="5.5" ry="6.5" />
          <path d="M309 155q11 11 22 0" />
        </>}
        {showBook && <g className="buddy-book"><path d="M296 158q12-7 24 0v31q-12-7-24 0z" /><path d="M320 158q12-7 24 0v31q-12-7-24 0z" /><path d="M320 159v31" /></g>}
        {accessory && <AccessoryDecoration accessory={accessory} />}
      </g>
      </g>
    </svg>
  )
}

function AccessoryDecoration({ accessory }: { accessory: ClosetAccessory }) {
  switch (accessory.slot) {
    case 'hat':
      if (accessory.id === 'top_hat') {
        return <image href={topHatArtwork} x="268" y="4" width="104" height="98" preserveAspectRatio="xMidYMid meet" />
      }
      if (accessory.id === 'starlight_wizard_hat') {
        return <image href={starlightWizardHatArtwork} x="290" y="-4" width="60" height="100" preserveAspectRatio="xMidYMid meet" />
      }
      if (accessory.id === 'cloud_hat') {
        return <image href={cloudHatArtwork} x="270" y="31" width="100" height="64" preserveAspectRatio="xMidYMid meet" />
      }
      return <g className="buddy-accessory"><path d="m288 87 32-15 32 15-32 12z" /><path d="M299 92v13q21 9 42 0V92" /></g>
    case 'glasses':
      return <g className="buddy-accessory glasses-accessory"><circle cx="300" cy="139" r="12" /><circle cx="340" cy="139" r="12" /><path d="M312 139h16" /></g>
    case 'scarf':
      return <g className="buddy-accessory scarf-accessory"><path d="M284 169q36 13 72 0l-4 17q-32 14-64 0z" /><path d="M342 181v20l-12-5" /></g>
    case 'headphones':
      return <g className="buddy-accessory headphones-accessory"><path d="M270 142a50 50 0 0 1 100 0" /><rect x="263" y="137" width="13" height="28" rx="6" /><rect x="364" y="137" width="13" height="28" rx="6" /></g>
    case 'backpack':
      return <g className="buddy-accessory backpack-accessory"><rect x="238" y="148" width="24" height="47" rx="8" /><path d="M244 159h12m-12 8h12" /></g>
    default:
      return <text className="buddy-accessory-icon" x="320" y="82" textAnchor="middle">{accessory.icon || '✦'}</text>
  }
}

function App() {
  const timer = useTimerSnapshot()
  const sessionMinutes = timer.durationMinutes
  const secondsLeft = timer.remainingSeconds
  const isRunning = timer.status === 'running'
  const isComplete = timer.status === 'complete'
  const isPaused = timer.status === 'paused'
  const isBreak = timer.mode === 'break'
  const isTimedSession = isRunning || isPaused || isComplete
  const hasValidDuration = sessionMinutes >= 5
  const [nightMode, setNightMode] = useState(() => window.localStorage.getItem('tomo.night-mode') === 'true')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [maxFocusEnabled, setMaxFocusEnabled] = useState(() => (
    window.localStorage.getItem('tomo.max-focus-consent-v2') === 'accepted'
    && window.localStorage.getItem('tomo.max-focus.enabled') === 'true'
  ))
  const [maxFocusThreshold, setMaxFocusThreshold] = useState<180 | 300 | 600>(() => {
    const stored = window.localStorage.getItem('tomo.max-focus.threshold')
    return stored === '300' ? 300 : stored === '600' ? 600 : 180
  })
  const [maxFocusSoundEnabled, setMaxFocusSoundEnabled] = useState(() =>
    window.localStorage.getItem('tomo.max-focus.sound') !== 'false'
  )
  const [maxFocusNudgeVisible, setMaxFocusNudgeVisible] = useState(false)
  const [maxFocusConsentOpen, setMaxFocusConsentOpen] = useState(false)
  const [desktopPetEnabled, setDesktopPetEnabled] = useState(false)
  const maxFocusAudioContext = useRef<AudioContext | null>(null)
  const maxFocusSoundEnabledRef = useRef(maxFocusSoundEnabled)
  const [authEmail, setAuthEmail] = useState('')
  const [buddyLook, setBuddyLook] = useState<BuddyLook>('blob')
  const [profileMessage, setProfileMessage] = useState('')
  const [closetAccessories, setClosetAccessories] = useState<ClosetAccessory[]>([])
  const [ownedAccessories, setOwnedAccessories] = useState<OwnedAccessory[]>([])
  const [completedSessionCount, setCompletedSessionCount] = useState(0)
  const [closetRefreshVersion, setClosetRefreshVersion] = useState(0)
  const [closetPage, setClosetPage] = useState<ClosetPage>('grid')
  const [selectedAccessoryId, setSelectedAccessoryId] = useState<string | null>(null)
  const [closetLoading, setClosetLoading] = useState(false)
  const [closetError, setClosetError] = useState('')
  const [isEquippingAccessory, setIsEquippingAccessory] = useState(false)
  const [newlyEarnedAccessories, setNewlyEarnedAccessories] = useState<Array<{ id: string; name: string; icon: string }>>([])
  const [modal, setModal] = useState<ModalName>(null)
  const [buddyName, setBuddyName] = useState('Tomo')
  const [draftBuddyName, setDraftBuddyName] = useState('Tomo')
  const [isEditingName, setIsEditingName] = useState(false)
  const [draftDuration, setDraftDuration] = useState({ hours: 0, minutes: 20 })
  const durationReturnTo = useRef<ModalName>(null)
  const lastTimerStatus = useRef<TimerStatus>('ready')
  const sessionCapture = useRef<{ id: string; startedAt: string } | null>(null)
  const finishOnboarding = useCallback((nextProfile: UserProfile, email: string) => {
    setProfile(nextProfile)
    setAuthEmail(email)
    setBuddyName(nextProfile.buddy_name)
    setDraftBuddyName(nextProfile.buddy_name)
    setBuddyLook(nextProfile.buddy_look)
    setProfileMessage('')
    setOwnedAccessories([])
    setClosetAccessories([])
    setCompletedSessionCount(0)
    setNewlyEarnedAccessories([])
    setSelectedAccessoryId(null)
    setClosetPage('grid')
    setClosetError('')
    sessionCapture.current = null
    lastTimerStatus.current = 'ready'
    setDesktopPetEnabled(
      window.localStorage.getItem(`tomo.desktop-pet.enabled.${nextProfile.id}`) === 'true'
    )
    void window.focusCompanion.getTimerState().then((current) => {
      if (current.status === 'ready' && current.durationMinutes !== nextProfile.session_minutes) {
        return window.focusCompanion.setTimerDuration(nextProfile.session_minutes)
      }
      return current
    })
  }, [])
  const status = isComplete
    ? isBreak ? 'BREAK COMPLETE' : 'SESSION COMPLETE'
    : isRunning
      ? isBreak ? 'BREAK TIME' : 'FOCUSING'
      : isPaused
        ? isBreak ? 'BREAK PAUSED' : 'PAUSED'
        : isBreak ? 'BREAK READY' : 'READY TO FOCUS'

  const thresholdLabel = maxFocusThreshold === 180 ? '3 min' : maxFocusThreshold === 300 ? '5 min' : '10 min'
  const thresholdLabelLong = maxFocusThreshold === 180 ? '3 minutes' : maxFocusThreshold === 300 ? '5 minutes' : '10 minutes'

  const showMaxFocusNudge = () => {
    setMaxFocusNudgeVisible(true)
    if (!maxFocusSoundEnabledRef.current) return
    if (typeof AudioContext === 'undefined') return

    const audioContext = maxFocusAudioContext.current ?? new AudioContext()
    maxFocusAudioContext.current = audioContext
    if (audioContext.state === 'suspended') void audioContext.resume()

    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const now = audioContext.currentTime
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(660, now)
    oscillator.frequency.setValueAtTime(880, now + 0.1)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28)
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.29)
  }

  useEffect(() => {
    maxFocusSoundEnabledRef.current = maxFocusSoundEnabled
    window.localStorage.setItem('tomo.max-focus.sound', String(maxFocusSoundEnabled))
  }, [maxFocusSoundEnabled])

  useEffect(() => {
    window.localStorage.setItem('tomo.max-focus.enabled', String(maxFocusEnabled))
    void window.focusCompanion.setMaxFocusEnabled(maxFocusEnabled)
  }, [maxFocusEnabled])

  useEffect(() => {
    window.localStorage.setItem('tomo.max-focus.threshold', String(maxFocusThreshold))
    void window.focusCompanion.setMaxFocusThreshold(maxFocusThreshold)
  }, [maxFocusThreshold])

  useEffect(() => {
    if (profile) {
      window.localStorage.setItem(`tomo.desktop-pet.enabled.${profile.id}`, String(desktopPetEnabled))
    }
    void window.focusCompanion.setDesktopPetVisible(desktopPetEnabled && Boolean(profile))
  }, [desktopPetEnabled, profile?.id])

  useEffect(() => {
    let active = true
    const unsubscribeNudge = window.focusCompanion.onMaxFocusNudge(showMaxFocusNudge)

    void window.focusCompanion.getPendingMaxFocusNudge().then((pending) => {
      if (active && pending) setMaxFocusNudgeVisible(true)
    })

    return () => {
      active = false
      unsubscribeNudge()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.focusCompanion.onDesktopPetClosed(() => {
      setDesktopPetEnabled(false)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!maxFocusEnabled || timer.status !== 'running' || timer.mode !== 'focus') {
      setMaxFocusNudgeVisible(false)
    }
  }, [maxFocusEnabled, timer.status, timer.mode])

  const acceptMaxFocus = () => {
    if (typeof AudioContext !== 'undefined') {
      const audioContext = maxFocusAudioContext.current ?? new AudioContext()
      maxFocusAudioContext.current = audioContext
      if (audioContext.state === 'suspended') void audioContext.resume().catch(() => undefined)
    }
    window.localStorage.setItem('tomo.max-focus-consent-v2', 'accepted')
    setMaxFocusEnabled(true)
    setMaxFocusConsentOpen(false)
  }

  const toggleMaxFocus = () => {
    if (maxFocusEnabled) {
      setMaxFocusEnabled(false)
    } else {
      setMaxFocusConsentOpen(true)
    }
  }

  const openClosetFromRoom = () => {
    setClosetPage('grid')
    setModal('closet')
  }

  // Clicking the name pillow in the room opens Settings with the name field ready to edit
  const openNameEditor = () => {
    setDraftBuddyName(buddyName)
    setIsEditingName(true)
    setModal('settings')
  }

  const toggleNightMode = () => {
    setNightMode((current) => {
      const next = !current
      window.localStorage.setItem('tomo.night-mode', String(next))
      return next
    })
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        setAuthEmail('')
        setModal(null)
        setProfileMessage('')
        setOwnedAccessories([])
        setClosetAccessories([])
        setCompletedSessionCount(0)
        setNewlyEarnedAccessories([])
        setSelectedAccessoryId(null)
        setClosetPage('grid')
        setClosetError('')
        sessionCapture.current = null
        lastTimerStatus.current = 'ready'
        // Clear device-local settings that are not per-account in localStorage.
        // Max Focus consent must be cleared so the next user sees the consent modal.
        window.localStorage.removeItem('tomo.max-focus-consent-v2')
        setMaxFocusEnabled(false)
        setDesktopPetEnabled(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!profile) return
    let active = true
    setClosetLoading(true)
    setClosetError('')

    void Promise.all([
      supabase
        .from('accessories')
        .select('id, name, description, is_active, slot, icon, unlock_sessions, sort_order')
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('user_accessories')
        .select('accessory_id, unlocked_at, is_equipped')
        .eq('user_id', profile.id),
      supabase
        .from('focus_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id),
    ]).then(([catalogResult, ownedResult, sessionsResult]) => {
      if (!active) return
      const queryError = catalogResult.error || ownedResult.error || sessionsResult.error
      if (queryError) {
        setClosetError(queryError.message)
        return
      }
      const catalog = (catalogResult.data ?? []) as ClosetAccessory[]
      const owned = (ownedResult.data ?? []) as OwnedAccessory[]
      setClosetAccessories(catalog)
      setOwnedAccessories(owned)
      setCompletedSessionCount(sessionsResult.count ?? 0)
      setSelectedAccessoryId((current) => current && catalog.some((item) => item.id === current) ? current : null)
    }).catch((error: unknown) => {
      if (active) setClosetError(error instanceof Error ? error.message : 'Could not load the closet.')
    }).finally(() => {
      if (active) setClosetLoading(false)
    })

    return () => { active = false }
  }, [profile?.id, closetRefreshVersion])

  useEffect(() => {
    const previousStatus = lastTimerStatus.current
    if (timer.mode === 'focus' && timer.status === 'running' && (previousStatus === 'ready' || previousStatus === 'complete')) {
      sessionCapture.current = { id: crypto.randomUUID(), startedAt: new Date().toISOString() }
    } else if (timer.status === 'ready' && previousStatus !== 'ready') {
      sessionCapture.current = null
    }

    const completedCapture = timer.mode === 'focus' && timer.status === 'complete' && previousStatus === 'running'
      ? sessionCapture.current
      : null
    if (completedCapture) sessionCapture.current = null

    if (previousStatus === 'complete' && timer.status !== 'complete') {
      setNewlyEarnedAccessories([])
    }

    lastTimerStatus.current = timer.status

    if (completedCapture && profile) {
      const profileId = profile.id
      const durationMinutes = timer.durationMinutes
      void (async () => {
        // 1. Snapshot owned accessory IDs before the insert so we can diff afterwards
        const { data: beforeOwned, error: beforeError } = await supabase
          .from('user_accessories')
          .select('accessory_id')
          .eq('user_id', profileId)
        const beforeIds = new Set((beforeOwned ?? []).map((o) => o.accessory_id as string))

        // 2. Save the focus session — the DB trigger fires here and grants eligible accessories
        const { error } = await supabase.from('focus_sessions').insert({
          id: completedCapture.id,
          user_id: profileId,
          started_at: completedCapture.startedAt,
          completed_at: new Date().toISOString(),
          duration_minutes: durationMinutes,
        })

        if (error) {
          console.error('Could not save completed focus session:', error)
          setProfileMessage(`Session completed, but its progress could not be saved: ${error.message}`)
          return
        }

        // 3. Re-query user_accessories — trigger has already run so new rows are present
        const { data: afterOwned, error: afterError } = await supabase
          .from('user_accessories')
          .select('accessory_id, unlocked_at, is_equipped')
          .eq('user_id', profileId)

        if (afterError || !afterOwned) {
          // Reward detection failed — session is saved; fail gracefully without false reward claim
          setClosetRefreshVersion((version) => version + 1)
          return
        }

        // 4. Update owned accessories state with fresh data
        setOwnedAccessories(afterOwned as OwnedAccessory[])

        // 5. Find IDs present after the insert but not before
        const newIds = (afterOwned as OwnedAccessory[])
          .map((o) => o.accessory_id)
          .filter((id) => !beforeIds.has(id))

        if (!beforeError && newIds.length > 0) {
          const { data: newItems } = await supabase
            .from('accessories')
            .select('id, name, icon')
            .in('id', newIds)
          if (newItems && newItems.length > 0) {
            setNewlyEarnedAccessories(newItems as Array<{ id: string; name: string; icon: string }>)
          }
        }

        // 6. Trigger a full closet refresh
        setClosetRefreshVersion((version) => version + 1)
      })()
    }
  }, [timer.status, timer.mode, timer.durationMinutes, profile])

  const startOrResume = () => {
    void window.focusCompanion.startTimer()
  }

  const pause = () => {
    void window.focusCompanion.pauseTimer()
  }

  const chooseDuration = async (minutes: number) => {
    void window.focusCompanion.setTimerDuration(minutes)
    if (profile) {
      const { error } = await supabase
        .from('profiles')
        .update({ session_minutes: minutes, updated_at: new Date().toISOString() })
        .eq('id', profile.id)
      if (error) {
        setProfileMessage(`Timer changed for this session, but could not save it to your account: ${error.message}`)
      } else {
        setProfile({ ...profile, session_minutes: minutes })
        setProfileMessage('Session length saved to your account.')
      }
    }
    setModal(durationReturnTo.current)
    durationReturnTo.current = null
  }

  const openDurationPicker = (returnTo: ModalName = null) => {
    if (isRunning) return
    durationReturnTo.current = returnTo
    setDraftDuration({
      hours: Math.floor(sessionMinutes / 60),
      minutes: sessionMinutes % 60,
    })
    setModal('duration')
  }

  const draftTotalMinutes = draftDuration.hours * 60 + draftDuration.minutes
  const durationSummary = draftDuration.hours > 0
    ? `${draftDuration.hours} hr ${draftDuration.minutes} min`
    : `${draftDuration.minutes} min`

  const primaryAction = () => {
    if (isRunning) {
      pause()
    } else if (isComplete) {
      startOrResume()
    } else {
      startOrResume()
    }
  }
  const saveName = async () => {
    const trimmed = draftBuddyName.trim().slice(0, BUDDY_NAME_MAX_LENGTH)
    if (!trimmed) return
    if (profile) {
      const { error } = await supabase
        .from('profiles')
        .update({ buddy_name: trimmed, updated_at: new Date().toISOString() })
        .eq('id', profile.id)
      if (error) {
        setProfileMessage(`Could not save buddy's name: ${error.message}`)
        return
      }
      setProfile({ ...profile, buddy_name: trimmed })
    }
    setBuddyName(trimmed)
    setProfileMessage(profile ? `${trimmed}’s name saved to your account.` : "")
    setIsEditingName(false)
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      setProfileMessage(`Could not sign out: ${error.message}`)
      return
    }
    setProfile(null)
    setAuthEmail('')
    setModal(null)
    setProfileMessage('')
    setOwnedAccessories([])
    setClosetAccessories([])
    setCompletedSessionCount(0)
    setNewlyEarnedAccessories([])
    setSelectedAccessoryId(null)
    setClosetPage('grid')
    setClosetError('')
    sessionCapture.current = null
    lastTimerStatus.current = 'ready'
    window.localStorage.removeItem('tomo.max-focus-consent-v2')
    setMaxFocusEnabled(false)
    setDesktopPetEnabled(false)
  }

  const ownedAccessoryIds = new Set(ownedAccessories.map((owned) => owned.accessory_id))
  const earnedAccessories = closetAccessories.filter((accessory) => ownedAccessoryIds.has(accessory.id))
  const equippedOwnedAccessory = ownedAccessories.find((owned) => owned.is_equipped)
  const equippedAccessory = closetAccessories.find((accessory) => accessory.id === equippedOwnedAccessory?.accessory_id)

  useEffect(() => {
    void window.focusCompanion.setDesktopPetAppearance({
      buddyName: profile ? buddyName : 'Tomo',
      look: profile ? buddyLook : 'blob',
      accessory: profile && equippedAccessory
        ? { name: equippedAccessory.name, icon: equippedAccessory.icon || '✦', slot: equippedAccessory.slot }
        : null,
    })
  }, [profile?.id, buddyName, buddyLook, equippedAccessory?.id])

  const selectedTryOnIndex = Math.max(0, earnedAccessories.findIndex((accessory) => accessory.id === selectedAccessoryId))
  const selectedTryOnAccessory = earnedAccessories[selectedTryOnIndex]
  const selectedTryOnHatArtwork = selectedTryOnAccessory?.id === 'starlight_wizard_hat'
    ? { src: starlightWizardHatArtwork, className: 'wizard-hat-art' }
    : selectedTryOnAccessory?.id === 'cloud_hat'
      ? { src: cloudHatArtwork, className: 'cloud-hat-art' }
      : null

  const equipAccessory = async (accessoryId: string | null) => {
    setIsEquippingAccessory(true)
    setClosetError('')
    const { error } = await supabase.rpc('set_equipped_accessory', { p_accessory_id: accessoryId })
    if (error) {
      setClosetError(error.message)
    } else {
      setOwnedAccessories((current) => current.map((owned) => ({
        ...owned,
        is_equipped: accessoryId !== null && owned.accessory_id === accessoryId,
      })))
      setProfileMessage(accessoryId ? `${buddyName} is wearing that accessory.` : 'Accessory removed.')
    }
    setIsEquippingAccessory(false)
  }

  if (!profile) {
    return <OnboardingFlow onComplete={finishOnboarding} />
  }

  return (
    <main className="app-shell">
      <section className={`study-window room-wall ${nightMode ? 'night-mode' : ''}`} aria-label="Tomo's Nook study screen">
        <header className="top-bar">
          <div className="hanging-sign">
            <svg className="hanging-sign-string" aria-hidden="true">
              <line x1="50%" y1="4" x2="16%" y2="28" />
              <line x1="50%" y1="4" x2="84%" y2="28" />
              <circle cx="50%" cy="4" r="3.5" />
            </svg>
            <h1>Tomo's Nook</h1>
          </div>
          <div className={`session-status header-status ${isComplete ? 'complete' : ''} ${isPaused ? 'paused' : ''} ${isBreak ? 'break' : ''}`} role="status">
            <span className="status-dot" />
            {!isTimedSession && !hasValidDuration ? 'NO SESSION SET' : status}
          </div>
        </header>

        {maxFocusNudgeVisible && maxFocusEnabled && isRunning && !isBreak && (
          <aside className="max-focus-nudge" role="alert" aria-live="assertive">
            <strong>Still focusing?</strong>
            <p>There hasn’t been keyboard or pointer activity for {thresholdLabel}.</p>
            <div className="max-focus-nudge-actions">
              <button
                type="button"
                className="nudge-dismiss-button"
                onClick={() => {
                  setMaxFocusNudgeVisible(false)
                  void window.focusCompanion.dismissMaxFocusNudge()
                }}
              >
                I’m still here
              </button>
              <button
                type="button"
                className="nudge-pause-button"
                onClick={() => {
                  setMaxFocusNudgeVisible(false)
                  void window.focusCompanion.dismissMaxFocusNudge()
                  void window.focusCompanion.pauseTimer()
                }}
              >
                Pause timer
              </button>
            </div>
          </aside>
        )}

        <section className={`focus-content ${isTimedSession ? 'session-mode-content' : ''}`} aria-label="Focus timer and companion">
          {isComplete ? (
            <>
            <div className={`timer-result ${isBreak ? 'break-result' : ''}`}>
              <h2 className="result-title">{isBreak ? 'Break complete' : 'Nice work!'}</h2>
              <p className="result-copy">
                {isBreak ? 'Ready to start another focus session?' : `You focused for ${formatDuration(sessionMinutes)}.`}
              </p>
              {!isBreak && newlyEarnedAccessories.length > 0 && (
                <div className="reward-earned">
                  <p className="reward-earned-heading">
                    {newlyEarnedAccessories.length === 1
                      ? 'You earned a new accessory!'
                      : `You earned ${newlyEarnedAccessories.length} new accessories!`}
                  </p>
                  {newlyEarnedAccessories.map((acc) => (
                    <div key={acc.id} className="reward-earned-item">
                      <span className="reward-earned-icon">{acc.icon || '✦'}</span>
                      <strong className="reward-earned-name">{acc.name}</strong>
                    </div>
                  ))}
                  <button
                    className="reward-view-closet"
                    onClick={() => { setClosetPage('grid'); setModal('closet') }}
                  >
                    View in Closet
                  </button>
                </div>
              )}
              <div className="result-actions">
                {isBreak ? (
                  <button className="start-button" onClick={() => { void window.focusCompanion.startFocusTimer(profile.session_minutes) }}>
                    Start a focus session
                  </button>
                ) : (
                  <>
                    <button className="start-button" onClick={() => { void window.focusCompanion.startBreakTimer() }}>
                      Take a Break (5 min)
                    </button>
                    <button className="extend-button" onClick={() => { void window.focusCompanion.startFocusTimer(20) }}>
                      Extend 20 Minutes
                    </button>
                    <button className="extend-button" onClick={() => { void window.focusCompanion.startFocusTimer(profile.session_minutes) }}>
                      Skip break
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="scene-frame result-scene">
              <BuddyScene look={buddyLook} buddyName={buddyName || 'Tomo'} accessory={equippedAccessory} nightMode={nightMode} onToggleNightMode={toggleNightMode} onEditName={openNameEditor} closetOpen={modal === 'closet'} onOpenCloset={openClosetFromRoom} />
            </div>
            </>
          ) : isTimedSession ? (
            <>
              {maxFocusEnabled && isRunning && !isBreak && (
                <p className="max-focus-session-active" aria-label="Max Focus is active">Max Focus active</p>
              )}
              <div className="timer" role="timer" aria-label={`${formatTime(secondsLeft, timer.durationMinutes)} remaining`}>
                {formatTime(secondsLeft, timer.durationMinutes)}
              </div>
              <div
                className="timer-progress"
                role="progressbar"
                aria-label={isBreak ? 'Break progress' : 'Focus session progress'}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(((sessionMinutes * 60 - secondsLeft) / (sessionMinutes * 60)) * 100)}
              >
                <span style={{ width: `${Math.min(100, Math.max(0, ((sessionMinutes * 60 - secondsLeft) / (sessionMinutes * 60)) * 100))}%` }} />
              </div>
              <p className="session-detail">
                {isBreak ? `${sessionMinutes}-minute break` : 'Stay with your focus session'}
              </p>
              <div className="primary-actions timer-actions">
                <button className="start-button" onClick={isRunning ? pause : startOrResume}>
                  {isRunning ? 'Pause' : isPaused ? 'Continue' : isBreak ? 'Start break' : 'Start'}
                </button>
                {isPaused && (
                  <button className="extend-button reset-session-button" onClick={() => { void window.focusCompanion.resetTimer() }}>
                    Reset session
                  </button>
                )}
              </div>
              <div className="buddy-caption session-caption">
                <p>
                  {isBreak
                    ? 'Take a few minutes away from your desk.'
                    : isPaused
                      ? `Paused at ${formatTime(secondsLeft, timer.durationMinutes)}. Continue whenever you are ready.`
                      : `${buddyName || 'Tomo'} is reading with you.`}
                </p>
              </div>
              <div className="scene-frame session-scene">
                <BuddyScene look={buddyLook} buddyName={buddyName || 'Tomo'} accessory={equippedAccessory} showBook={isRunning && !isBreak} nightMode={nightMode} onToggleNightMode={toggleNightMode} onEditName={openNameEditor} closetOpen={modal === 'closet'} onOpenCloset={openClosetFromRoom} />
              </div>
            </>
          ) : !hasValidDuration ? (
            <>
              <div className="timer" aria-label="No session duration set">
                --:--
              </div>
              <p className="session-detail">
                Choose a session length to get started
              </p>
              <div className="primary-actions">
                <button className="start-button" onClick={() => openDurationPicker()}>
                  Choose session length
                </button>
              </div>
              <div className="buddy-caption">
                <p>Set a focus duration to begin.</p>
              </div>
              <div className="scene-frame">
                <BuddyScene look={buddyLook} buddyName={buddyName || 'Tomo'} accessory={equippedAccessory} nightMode={nightMode} onToggleNightMode={toggleNightMode} onEditName={openNameEditor} closetOpen={modal === 'closet'} onOpenCloset={openClosetFromRoom} />
              </div>
            </>
          ) : (
            <>
              <div className="timer timer-duration" aria-label={`${formatDuration(timer.durationMinutes)} session`}>
                {formatDuration(timer.durationMinutes)}
              </div>
              <p className="session-detail">
                Session length
                <span aria-hidden="true"> · </span>
                <button className="text-button" onClick={() => openDurationPicker()}>
                  Change
                </button>
              </p>
              <div className="primary-actions">
                <button className="start-button" onClick={primaryAction}>Start</button>
              </div>
              <div className="buddy-caption">
                {!equippedAccessory && <p>Finish a focus session to earn your first accessory</p>}
              </div>
              <div className="scene-frame">
                <BuddyScene look={buddyLook} buddyName={buddyName || 'Tomo'} accessory={equippedAccessory} nightMode={nightMode} onToggleNightMode={toggleNightMode} onEditName={openNameEditor} closetOpen={modal === 'closet'} onOpenCloset={openClosetFromRoom} />
              </div>
            </>
          )}
        </section>

        {!isTimedSession && (
          <footer className="bottom-bar">
          <div className="max-focus">
            <button
              className={`switch ${maxFocusEnabled ? 'is-on' : ''}`}
              type="button"
              role="switch"
              aria-checked={maxFocusEnabled}
              aria-label={`Max Focus ${maxFocusEnabled ? 'on' : 'off'}`}
              onClick={toggleMaxFocus}
            >
                <span />
              </button>
              <span className="max-focus-label">Max Focus</span>
            <span className="max-focus-description">{maxFocusEnabled ? `On · ${thresholdLabel} idle` : 'Off'}</span>
            </div>
            <div className="footer-actions">
              <button className="secondary-button" onClick={() => { setIsEditingName(false); setModal('settings') }}>Settings</button>
              <button className="secondary-button" onClick={() => { setClosetPage('grid'); setModal('closet') }}>Closet</button>
            </div>
          </footer>
        )}
      </section>

      {modal && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}>
          <section className={`modal-card ${modal === 'closet' ? 'closet-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            {(modal === 'settings' || modal === 'closet') && (
              <button className="modal-close" aria-label="Close dialog" onClick={() => setModal(null)}>×</button>
            )}
            {modal === 'duration' && (
              <>
                <p className="eyebrow">STUDY BUDDY — SETTINGS</p>
                <h2 id="modal-title">Session length</h2>
                <p className="modal-description">Scroll the wheels to set your focus time.</p>
                <div className="time-wheel" role="group" aria-label="Choose session length">
                  <div className="time-wheel-selected" aria-hidden="true" />
                  <WheelColumn
                    label="Hours"
                    unit="hr"
                    values={hourOptions}
                    value={draftDuration.hours}
                    onChange={(hours) => setDraftDuration((current) => ({ ...current, hours }))}
                  />
                  <WheelColumn
                    label="Minutes"
                    unit="min"
                    values={minuteOptions}
                    value={draftDuration.minutes}
                    onChange={(minutes) => setDraftDuration((current) => ({ ...current, minutes }))}
                  />
                </div>
                <p className="duration-summary">
                  Each session: <strong>{draftTotalMinutes > 0 ? durationSummary : 'choose at least 5 min'}</strong>
                </p>
                <div className="modal-actions">
                  <button className="secondary-button" onClick={() => { setModal(durationReturnTo.current); durationReturnTo.current = null }}>Cancel</button>
                  <button
                    className="confirm-button"
                    disabled={draftTotalMinutes === 0}
                    onClick={() => chooseDuration(draftTotalMinutes)}
                  >
                    Done
                  </button>
                </div>
              </>
            )}
            {modal === 'settings' && (
              <>
                <h2 id="modal-title">Settings</h2>
                <div className="settings-row desktop-pet-setting">
                  <div>
                    <span className="settings-row-title">Show Buddy on desktop</span>
                    <span className="settings-row-value">A small movable window stays above your other apps.</span>
                  </div>
                  <button
                    className={`desktop-pet-toggle ${desktopPetEnabled ? 'enabled' : ''}`}
                    type="button"
                    role="switch"
                    aria-checked={desktopPetEnabled}
                    aria-label="Show Buddy on desktop"
                    onClick={() => setDesktopPetEnabled((enabled) => !enabled)}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-account">
                  <span className="settings-row-title">Signed in as</span>
                  <span className="settings-row-value">{authEmail}</span>
                  <span className="settings-row-value">Username: {profile.username}</span>
                </div>
                <div className="settings-row">
                  {isEditingName ? (
                    <>
                      <label className="settings-row-title" htmlFor="buddy-name-input">Study Buddy name</label>
                      <input
                        id="buddy-name-input"
                        className="settings-input"
                        type="text"
                        value={draftBuddyName}
                        onChange={(e) => setDraftBuddyName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setIsEditingName(false) }}
                        maxLength={BUDDY_NAME_MAX_LENGTH}
                        autoFocus
                      />
                    </>
                  ) : (
                    <>
                      <span className="settings-row-title">Study Buddy name</span>
                      <div className="settings-name-actions">
                        <span className="settings-row-value">{buddyName}</span>
                        <button className="settings-pencil" onClick={() => { setDraftBuddyName(buddyName); setIsEditingName(true) }} aria-label="Edit buddy name">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <path d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {isEditingName && <p className="settings-name-hint">Enter to save · Esc to cancel</p>}
                <div className="settings-row">
                  <span className="settings-row-title">Session length</span>
                  <div className="settings-name-actions">
                    <span className="settings-row-value">{formatDuration(sessionMinutes)}</span>
                    <button
                      className="settings-pencil"
                      onClick={() => openDurationPicker('settings')}
                      disabled={isRunning}
                      aria-label={isRunning ? 'Cannot change session length while timer is running' : 'Change session length'}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
                {isRunning && <p className="settings-running-note">Pause the timer to change session length.</p>}
                <div className="settings-section-divider" />
                <p className="settings-section-label">MAX FOCUS</p>
                <p className="settings-section-description">Monitors keyboard and pointer activity. After {thresholdLabelLong} of inactivity during a focus session, shows a reminder.</p>
                <div className="settings-row">
                  <span className="settings-row-title">Enable Max Focus</span>
                  <button
                    className={`switch ${maxFocusEnabled ? 'is-on' : ''}`}
                    type="button"
                    role="switch"
                    aria-checked={maxFocusEnabled}
                    aria-label={`Max Focus ${maxFocusEnabled ? 'on' : 'off'}`}
                    onClick={toggleMaxFocus}
                  >
                    <span />
                  </button>
                </div>
                {maxFocusEnabled && (
                  <>
                    <div className="settings-row">
                      <span className="settings-row-title">Idle reminder after</span>
                      <div className="max-focus-threshold-options">
                        {([180, 300, 600] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            className={`threshold-option ${maxFocusThreshold === t ? 'selected' : ''}`}
                            onClick={() => setMaxFocusThreshold(t)}
                          >
                            {t === 180 ? '3 min' : t === 300 ? '5 min' : '10 min'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="settings-row">
                      <span className="settings-row-title">Reminder sound</span>
                      <button
                        className={`switch ${maxFocusSoundEnabled ? 'is-on' : ''}`}
                        type="button"
                        role="switch"
                        aria-checked={maxFocusSoundEnabled}
                        aria-label={`Reminder sound ${maxFocusSoundEnabled ? 'on' : 'off'}`}
                        onClick={() => setMaxFocusSoundEnabled((v) => !v)}
                      >
                        <span />
                      </button>
                    </div>
                  </>
                )}
                {profileMessage && <p className="profile-message" role="status">{profileMessage}</p>}
                <div className="settings-account-actions">
                  <button className="text-button" onClick={() => { void signOut() }}>Sign out</button>
                </div>
              </>
            )}
            {modal === 'closet' && (
              <div className="closet-view">
                <div className="closet-heading">
                  <div className="closet-heading-title">
                    <h2 id="modal-title">{closetPage === 'try-on' ? 'Try on' : 'Closet'}</h2>
                    {closetPage === 'try-on' && (
                      <button className="closet-back-button" onClick={() => setClosetPage('grid')}>
                        ‹ Closet
                      </button>
                    )}
                  </div>
                  <span className="closet-count">
                    {closetPage === 'try-on' && earnedAccessories.length > 0
                      ? `${selectedTryOnIndex + 1} of ${earnedAccessories.length}`
                      : `${earnedAccessories.length} earned`}
                  </span>
                </div>

                <div className="closet-buddy-card">
                  <div className="closet-buddy-avatar">
                    <BuddyAvatar look={buddyLook} className="closet-avatar" />
                    {equippedAccessory && <span className="closet-worn-icon">{equippedAccessory.icon || '✦'}</span>}
                  </div>
                  <div className="closet-buddy-copy">
                    <strong>{buddyName}</strong>
                    <span>Wearing: {equippedAccessory?.name ?? 'nothing yet'}</span>
                  </div>
                </div>

                {closetLoading && <p className="closet-feedback">Loading your closet…</p>}
                {closetError && (
                  <div className="closet-error" role="alert">
                    <span>{closetError}</span>
                    <button onClick={() => setClosetRefreshVersion((version) => version + 1)}>Retry</button>
                  </div>
                )}

                {!closetLoading && !closetError && closetPage === 'grid' && (
                  <>
                    <p className="closet-section-label">ACCESSORIES</p>
                    {closetAccessories.length > 0 ? (
                      <div className="accessory-grid">
                        {closetAccessories.map((accessory) => {
                          const isOwned = ownedAccessoryIds.has(accessory.id)
                          const isEquipped = equippedAccessory?.id === accessory.id
                          const remainingSessions = Math.max(0, accessory.unlock_sessions - completedSessionCount)
                          return (
                            <button
                              key={accessory.id}
                              className={`accessory-tile ${isOwned ? 'earned' : 'locked'} ${isEquipped ? 'equipped' : ''}`}
                              disabled={!isOwned}
                              onClick={() => { setSelectedAccessoryId(accessory.id); setClosetPage('try-on') }}
                              aria-label={`${accessory.name}, ${isEquipped ? 'wearing' : isOwned ? 'earned, try on' : `locked, ${remainingSessions} more sessions`}`}
                            >
                              <span className="accessory-tile-icon">{isOwned ? accessory.icon || '✦' : '🔒'}</span>
                              <strong>{accessory.name}</strong>
                              <span className="accessory-tile-status">
                                {isEquipped ? '✓ Wearing' : isOwned ? 'Earned' : remainingSessions === 1 ? '1 more session' : `${remainingSessions} more sessions`}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="closet-empty-state">
                        <div className="closet-empty-symbol" aria-hidden="true">✦</div>
                        <h3>Your closet is empty</h3>
                        <p>Accessories will show up here when they are added to the catalog.</p>
                      </div>
                    )}
                    <div className="closet-footer">
                      {earnedAccessories.length === 0 && closetAccessories.length > 0 && (
                        <p className="closet-empty-hint">Finish a focus session to earn your first accessory for {buddyName || 'Tomo'}.</p>
                      )}
                      <button
                        className="closet-primary-action"
                        onClick={() => {
                          if (earnedAccessories.length > 0) {
                            setSelectedAccessoryId(equippedAccessory?.id ?? earnedAccessories[0]?.id ?? null)
                            setClosetPage('try-on')
                          } else {
                            setModal(null)
                            startOrResume()
                          }
                        }}
                      >
                        {earnedAccessories.length > 0 ? 'Browse & equip' : 'Start a session'}
                      </button>
                    </div>
                  </>
                )}

                {!closetLoading && !closetError && closetPage === 'try-on' && (
                  selectedTryOnAccessory ? (
                    <div className="closet-try-on">
                      <div className="try-on-stage">
                        <button
                          className="try-on-arrow"
                          aria-label="Previous accessory"
                          disabled={earnedAccessories.length < 2}
                          onClick={() => {
                            const nextIndex = (selectedTryOnIndex - 1 + earnedAccessories.length) % earnedAccessories.length
                            setSelectedAccessoryId(earnedAccessories[nextIndex]?.id ?? null)
                          }}
                        >‹</button>
                        <div className="try-on-buddy">
                          <BuddyAvatar look={buddyLook} className="try-on-avatar" />
                          {selectedTryOnHatArtwork ? (
                            <img className={`try-on-hat-art ${selectedTryOnHatArtwork.className}`} src={selectedTryOnHatArtwork.src} alt="" />
                          ) : (
                            <span className="try-on-icon">{selectedTryOnAccessory.icon || '✦'}</span>
                          )}
                        </div>
                        <button
                          className="try-on-arrow"
                          aria-label="Next accessory"
                          disabled={earnedAccessories.length < 2}
                          onClick={() => {
                            const nextIndex = (selectedTryOnIndex + 1) % earnedAccessories.length
                            setSelectedAccessoryId(earnedAccessories[nextIndex]?.id ?? null)
                          }}
                        >›</button>
                      </div>
                      <h3 className="try-on-name">{selectedTryOnAccessory.name}</h3>
                      <p className="try-on-earned">{selectedTryOnAccessory.description || `Earned after ${selectedTryOnAccessory.unlock_sessions} focus session${selectedTryOnAccessory.unlock_sessions === 1 ? '' : 's'}`}</p>
                      <div className="try-on-dots" aria-label={`${selectedTryOnIndex + 1} of ${earnedAccessories.length}`}>
                        {earnedAccessories.map((accessory, index) => <span key={accessory.id} className={index === selectedTryOnIndex ? 'active' : ''} />)}
                      </div>
                      <button
                        className="try-on-equip-button"
                        disabled={isEquippingAccessory}
                        onClick={() => void equipAccessory(equippedAccessory?.id === selectedTryOnAccessory.id ? null : selectedTryOnAccessory.id)}
                      >
                        {isEquippingAccessory ? 'Saving…' : equippedAccessory?.id === selectedTryOnAccessory.id ? '✓ Equipped — Remove' : `Equip on ${buddyName || 'Tomo'}`}
                      </button>
                      <button className="try-on-done" onClick={() => setModal(null)}>Done — back to studying</button>
                    </div>
                  ) : (
                    <div className="closet-empty-state"><h3>Nothing to try on yet</h3><p>Complete a focus session to earn your first accessory.</p></div>
                  )
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {maxFocusConsentOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.target === event.currentTarget && setMaxFocusConsentOpen(false)}
        >
          <section
            className="modal-card max-focus-consent-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="max-focus-consent-title"
            aria-describedby="max-focus-consent-description"
          >
            <p className="eyebrow">OPTIONAL FOCUS SUPPORT</p>
            <h2 id="max-focus-consent-title">Turn on Max Focus?</h2>
            <p id="max-focus-consent-description" className="modal-description">
              During a focus session, Tomo’s Nook checks for keyboard or pointer activity anywhere on your Mac.
              After your selected period of inactivity, it shows a reminder asking if you&apos;re still focusing and can play a short chime.
            </p>
            <p className="max-focus-privacy-note">You can change the idle reminder time in Settings.</p>
            <p className="max-focus-privacy-note">It doesn’t record your screen or use your camera.</p>
            <div className="modal-actions max-focus-consent-actions">
              <button className="secondary-button" onClick={() => setMaxFocusConsentOpen(false)}>Deny</button>
              <button className="confirm-button" onClick={acceptMaxFocus}>Accept &amp; turn on</button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root element was not found')
}

const isTimerPopup = new URLSearchParams(window.location.search).get('view') === 'timer'
const isDesktopPet = new URLSearchParams(window.location.search).get('view') === 'pet'
if (isDesktopPet) {
  document.documentElement.classList.add('desktop-pet-window')
  document.body.classList.add('desktop-pet-window')
}
createRoot(container).render(isTimerPopup ? <TimerPopup /> : isDesktopPet ? <DesktopPet /> : <App />)
