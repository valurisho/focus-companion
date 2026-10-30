import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { supabase } from './utils/supabase'
import { BuddyAvatar, OnboardingFlow, type BuddyLook, type UserProfile } from './onboarding'

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

function BuddyScene({ look, accessory }: { look: BuddyLook; accessory?: ClosetAccessory }) {
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
        {accessory && <AccessoryDecoration accessory={accessory} />}
      </g>
    </svg>
  )
}

function AccessoryDecoration({ accessory }: { accessory: ClosetAccessory }) {
  switch (accessory.slot) {
    case 'hat':
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
  const [profile, setProfile] = useState<UserProfile | null>(null)
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
  const [modal, setModal] = useState<ModalName>(null)
  const [buddyName, setBuddyName] = useState('Buddy')
  const [draftBuddyName, setDraftBuddyName] = useState('Buddy')
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

  useEffect(() => {
    if (modal !== 'closet' || !profile) return
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
  }, [modal, profile?.id, timer.status, closetRefreshVersion])

  useEffect(() => {
    const previousStatus = lastTimerStatus.current
    if (timer.status === 'running' && (previousStatus === 'ready' || previousStatus === 'complete')) {
      sessionCapture.current = { id: crypto.randomUUID(), startedAt: new Date().toISOString() }
    } else if (timer.status === 'ready' && previousStatus !== 'ready') {
      sessionCapture.current = null
    }

    const completedCapture = timer.status === 'complete' && previousStatus === 'running'
      ? sessionCapture.current
      : null
    if (completedCapture) sessionCapture.current = null
    lastTimerStatus.current = timer.status

    if (completedCapture && profile) {
      void supabase.from('focus_sessions').insert({
        id: completedCapture.id,
        user_id: profile.id,
        started_at: completedCapture.startedAt,
        completed_at: new Date().toISOString(),
        duration_minutes: timer.durationMinutes,
      }).then(({ error }) => {
        if (error) {
          console.error('Could not save completed focus session:', error)
          setProfileMessage(`Session completed, but its progress could not be saved: ${error.message}`)
        } else {
          setClosetRefreshVersion((version) => version + 1)
        }
      })
    }
  }, [timer.status, timer.durationMinutes, profile])

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

  const ownedAccessoryIds = new Set(ownedAccessories.map((owned) => owned.accessory_id))
  const earnedAccessories = closetAccessories.filter((accessory) => ownedAccessoryIds.has(accessory.id))
  const equippedOwnedAccessory = ownedAccessories.find((owned) => owned.is_equipped)
  const equippedAccessory = closetAccessories.find((accessory) => accessory.id === equippedOwnedAccessory?.accessory_id)
  const selectedTryOnIndex = Math.max(0, earnedAccessories.findIndex((accessory) => accessory.id === selectedAccessoryId))
  const selectedTryOnAccessory = earnedAccessories[selectedTryOnIndex]

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
      setProfileMessage(accessoryId ? 'Buddy is wearing that accessory.' : 'Accessory removed.')
    }
    setIsEquippingAccessory(false)
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
            <BuddyScene look={buddyLook} accessory={equippedAccessory} />
          </div>

          <div className="buddy-caption">
            <h2>{buddyName || 'Buddy'}</h2>
            <p>
              {isComplete
                ? 'Lovely work — your buddy is proud of you!'
                : equippedAccessory
                  ? `Wearing ${equippedAccessory.name} — complete sessions to earn more`
                  : 'Finish a focus session to earn your first accessory'}
            </p>
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
            <button className="secondary-button" onClick={() => { setClosetPage('grid'); setModal('closet') }}>Closet</button>
          </div>
        </footer>
      </section>

      {modal && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}>
          <section className={`modal-card ${modal === 'closet' ? 'closet-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            {modal === 'settings' && (
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
              <div className="closet-view">
                <div className="closet-heading">
                  <button
                    className="closet-back-button"
                    onClick={() => closetPage === 'try-on' ? setClosetPage('grid') : setModal(null)}
                  >
                    {closetPage === 'try-on' ? '‹ Closet' : '‹ Back'}
                  </button>
                  <h2 id="modal-title">{closetPage === 'try-on' ? 'Try on' : 'Closet'}</h2>
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
                    {earnedAccessories.length === 0 && closetAccessories.length > 0 && (
                      <p className="closet-empty-hint">Finish a focus session to earn your first accessory for Buddy.</p>
                    )}
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
                          <span className="try-on-icon">{selectedTryOnAccessory.icon || '✦'}</span>
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
                        {isEquippingAccessory ? 'Saving…' : equippedAccessory?.id === selectedTryOnAccessory.id ? '✓ Equipped — Remove' : 'Equip on Buddy'}
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
    </main>
  )
}

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root element was not found')
}

const isTimerPopup = new URLSearchParams(window.location.search).get('view') === 'timer'
createRoot(container).render(isTimerPopup ? <TimerPopup /> : <App />)
