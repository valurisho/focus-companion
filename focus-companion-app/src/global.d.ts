type TimerStatus = 'ready' | 'running' | 'paused' | 'complete'

interface TimerSnapshot {
  status: TimerStatus
  durationMinutes: number
  remainingSeconds: number
}

interface Window {
  focusCompanion: {
    platform: NodeJS.Platform
    getTimerState: () => Promise<TimerSnapshot>
    startTimer: () => Promise<TimerSnapshot>
    pauseTimer: () => Promise<TimerSnapshot>
    setTimerDuration: (minutes: number) => Promise<TimerSnapshot>
    resetTimer: () => Promise<TimerSnapshot>
    onTimerUpdate: (callback: (snapshot: TimerSnapshot) => void) => () => void
  }
}
