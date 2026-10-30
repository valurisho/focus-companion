type TimerStatus = 'ready' | 'running' | 'paused' | 'complete'
type TimerMode = 'focus' | 'break'

interface TimerSnapshot {
  status: TimerStatus
  mode: TimerMode
  durationMinutes: number
  remainingSeconds: number
}

interface Window {
  focusCompanion: {
    platform: NodeJS.Platform
    getTimerState: () => Promise<TimerSnapshot>
    startTimer: () => Promise<TimerSnapshot>
    startFocusTimer: (minutes: number) => Promise<TimerSnapshot>
    startBreakTimer: () => Promise<TimerSnapshot>
    pauseTimer: () => Promise<TimerSnapshot>
    setTimerDuration: (minutes: number) => Promise<TimerSnapshot>
    resetTimer: () => Promise<TimerSnapshot>
    onTimerUpdate: (callback: (snapshot: TimerSnapshot) => void) => () => void
  }
}
