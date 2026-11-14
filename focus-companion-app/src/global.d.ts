type TimerStatus = 'ready' | 'running' | 'paused' | 'complete'
type TimerMode = 'focus' | 'break'

interface TimerSnapshot {
  status: TimerStatus
  mode: TimerMode
  durationMinutes: number
  remainingSeconds: number
}

type DesktopPetAccessorySlot = 'hat' | 'glasses' | 'scarf' | 'headphones' | 'backpack' | string

interface DesktopPetAppearance {
  buddyName: string
  look: 'blob' | 'cat' | 'owl'
  accessory: { name: string; icon: string; slot: DesktopPetAccessorySlot } | null
}

interface Window {
  focusCompanion: {
    platform: NodeJS.Platform
    getTimerState: () => Promise<TimerSnapshot>
    setMaxFocusEnabled: (enabled: boolean) => Promise<void>
    setMaxFocusThreshold: (seconds: number) => Promise<void>
    getPendingMaxFocusNudge: () => Promise<boolean>
    dismissMaxFocusNudge: () => Promise<void>
    startTimer: () => Promise<TimerSnapshot>
    startFocusTimer: (minutes: number) => Promise<TimerSnapshot>
    startBreakTimer: () => Promise<TimerSnapshot>
    pauseTimer: () => Promise<TimerSnapshot>
    setTimerDuration: (minutes: number) => Promise<TimerSnapshot>
    resetTimer: () => Promise<TimerSnapshot>
    onTimerUpdate: (callback: (snapshot: TimerSnapshot) => void) => () => void
    onMaxFocusNudge: (callback: () => void) => () => void
    onMaxFocusActivity: (callback: () => void) => () => void
    quitApp: () => Promise<void>
    hidePopup: () => Promise<void>
    showMainWindow: () => Promise<void>
    onCelebration: (callback: () => void) => () => void
    setDesktopPetVisible: (visible: boolean) => Promise<void>
    closeDesktopPet: () => Promise<void>
    setDesktopPetAppearance: (appearance: DesktopPetAppearance) => Promise<void>
    getDesktopPetAppearance: () => Promise<DesktopPetAppearance>
    onDesktopPetAppearance: (callback: (appearance: DesktopPetAppearance) => void) => () => void
  }
}
