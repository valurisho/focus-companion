import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { supabase } from './utils/supabase'
import { OnboardingFlow, type BuddyLook, type UserProfile } from './onboarding'

type ModalName = 'duration' | 'settings' | 'closet' | null

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

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function useTimerSnapshot() {
  const [snapshot, setSnapshot] = useState<TimerSnapshot>({
    status: 'ready',
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

function TimerPopup() {
  const timer = useTimerSnapshot()
  const statusLabel = timer.status === 'running'
    ? 'FOCUSING'
    : timer.status === 'paused'
      ? 'PAUSED'
      : timer.status === 'complete'
        ? 'SESSION COMPLETE'
        : 'FOCUS TIMER'

  return (
    <main className="timer-popup-screen" aria-label="Focus Companion timer">
      <span className={`timer-popup-status ${timer.status}`}>
        <span className="status-dot" />
        {statusLabel}
      </span>
      <div className="timer-popup-time" role="timer" aria-label={`${formatTime(timer.remainingSeconds)} remaining`}>
        {formatTime(timer.remainingSeconds)}
      </div>
    </main>
  )
}

function BuddyScene({ look }: { look: BuddyLook }) {
  return (
    <svg
      className="buddy-scene"
      viewBox="0 0 640 300"
      role="img"
      aria-labelledby="buddy-scene-title"
      preserveAspectRatio="xMidYMid meet"
    >
      <title id="buddy-scene-title">Your study buddy relaxing on a sofa</title>
      <rect x="1" y="1" width="638" height="298" rx="24" className="scene-background" />
      <g className="scene-window">
        <rect x="42" y="34" width="112" height="94" rx="4" />
        <path d="M98 35v92M43 81h110" />
      </g>
      <g className="scene-lamp">
        <path d="M548 76h48l14 47h-76zM572 123v126" />
        <path d="M552 250h40" />
      </g>
      <ellipse className="scene-shadow" cx="320" cy="270" rx="190" ry="17" />
      <path className="scene-floor" d="M4 244h632" />
      <g className="scene-sofa">
        <path d="M184 190v-45a21 21 0 0 1 21-21h230a21 21 0 0 1 21 21v45" />
        <path d="M196 171h248v54H196z" />
        <rect x="158" y="153" width="43" height="87" rx="17" />
        <rect x="439" y="153" width="43" height="87" rx="17" />
        <path d="M183 240v9m251-9v9" />
      </g>
      <g className="scene-buddy">
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
      </g>
    </svg>
  )
}

function App() {
  const timer = useTimerSnapshot()
  const sessionMinutes = timer.durationMinutes
  const secondsLeft = timer.remainingSeconds
  const isRunning = timer.status === 'running'
  const isComplete = timer.status === 'complete'
  const isPaused = timer.status === 'paused'
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [buddyLook, setBuddyLook] = useState<BuddyLook>('blob')
  const [profileMessage, setProfileMessage] = useState('')
  const [modal, setModal] = useState<ModalName>(null)
  const [buddyName, setBuddyName] = useState('Buddy')
  const [draftBuddyName, setDraftBuddyName] = useState('Buddy')
  const [isEditingName, setIsEditingName] = useState(false)
  const [draftDuration, setDraftDuration] = useState({ hours: 0, minutes: 20 })
  const durationReturnTo = useRef<ModalName>(null)
  const finishOnboarding = useCallback((nextProfile: UserProfile, email: string) => {
    setProfile(nextProfile)
    setAuthEmail(email)
    setBuddyName(nextProfile.buddy_name)
    setDraftBuddyName(nextProfile.buddy_name)
    setBuddyLook(nextProfile.buddy_look)
    setProfileMessage('')
    void window.focusCompanion.getTimerState().then((current) => {
      if (current.status === 'ready' && current.durationMinutes !== nextProfile.session_minutes) {
        return window.focusCompanion.setTimerDuration(nextProfile.session_minutes)
      }
      return current
    })
  }, [])
  const status = isComplete
    ? 'SESSION COMPLETE'
    : isRunning
      ? 'FOCUS IN PROGRESS'
      : isPaused
        ? 'PAUSED — TAKE YOUR TIME'
        : 'READY TO FOCUS'

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
    const trimmed = draftBuddyName.trim()
    if (!trimmed) return
    if (profile) {
      const { error } = await supabase
        .from('profiles')
        .update({ buddy_name: trimmed, updated_at: new Date().toISOString() })
        .eq('id', profile.id)
      if (error) {
        setProfileMessage(`Could not save Buddy's name: ${error.message}`)
        return
      }
      setProfile({ ...profile, buddy_name: trimmed })
    }
    setBuddyName(trimmed)
    setProfileMessage(profile ? 'Buddy’s name saved to your account.' : '')
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
  }

  if (!profile) {
    return <OnboardingFlow onComplete={finishOnboarding} />
  }

  return (
    <main className="app-shell">
      <section className="study-window" aria-label="Focus Companion study screen">
        <header className="top-bar">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">✦</span>
            <div>
              <p className="eyebrow">YOUR STUDY SPACE</p>
              <h1>Study Buddy</h1>
            </div>
          </div>
          <span className="buddy-status"><span /> {buddyName || 'Buddy'} is here</span>
        </header>

        <section className="focus-content" aria-label="Focus timer and companion">
          <div className={`session-status ${isComplete ? 'complete' : ''}`}>
            <span className="status-dot" />
            {status}
          </div>

          <div className="timer" role="timer" aria-label={`${formatTime(secondsLeft)} remaining`}>
            {formatTime(secondsLeft)}
          </div>
          <p className="session-detail">
            {sessionMinutes}-min session
            <span aria-hidden="true"> · </span>
            <button className="text-button" onClick={() => openDurationPicker()} disabled={isRunning}>
              Change
            </button>
          </p>

          <div className="scene-frame">
            <BuddyScene look={buddyLook} />
          </div>

          <div className="buddy-caption">
            <h2>{buddyName || 'Buddy'}</h2>
            <p>{isComplete ? 'Lovely work — your buddy is proud of you!' : 'No accessories yet — finish a session to earn one'}</p>
          </div>

          <div className="primary-actions">
            <button className="start-button" onClick={primaryAction}>
              {isRunning ? 'Pause' : isPaused ? 'Resume' : isComplete ? 'Start another session' : 'Start'}
            </button>
            {(isRunning || isPaused) && (
              <button className="reset-button" onClick={() => window.focusCompanion.resetTimer()}>
                End session
              </button>
            )}
          </div>
        </section>

        <footer className="bottom-bar">
          <div className="max-focus" aria-label="Max Focus is coming soon">
            <button className="switch" type="button" disabled aria-label="Max Focus off, coming soon">
              <span />
            </button>
            <span className="max-focus-label">Max Focus</span>
            <span className="coming-soon">Coming soon</span>
          </div>
          <div className="footer-actions">
            <button className="secondary-button" onClick={() => { setIsEditingName(false); setModal('settings') }}>Settings</button>
            <button className="secondary-button" onClick={() => setModal('closet')}>Closet</button>
          </div>
        </footer>
      </section>

      {modal && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            {modal !== 'duration' && (
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
                <p className="eyebrow">YOUR PREFERENCES</p>
                <h2 id="modal-title">Settings</h2>
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
                        maxLength={20}
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
                {profileMessage && <p className="profile-message" role="status">{profileMessage}</p>}
                <div className="settings-account-actions">
                  <button className="text-button" onClick={() => { void signOut() }}>Sign out</button>
                </div>
              </>
            )}
            {modal === 'closet' && (
              <>
                <p className="eyebrow">BUDDY’S CLOSET</p>
                <h2 id="modal-title">A little something to earn</h2>
                <p className="modal-description">Your closet is empty for now. Complete a focus session to earn your first accessory for Buddy.</p>
                <div className="closet-preview" aria-hidden="true"><span>✦</span><span>♡</span><span>✿</span></div>
              </>
            )}
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
createRoot(container).render(isTimerPopup ? <TimerPopup /> : <App />)
