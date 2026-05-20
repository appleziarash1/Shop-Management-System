/**
 * Notification Sound Utility
 * Uses the Web Audio API to generate notification sounds without external files.
 */

let audioContext = null

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioContext
}

/**
 * Play a pleasant notification chime
 */
export const playNotificationSound = () => {
  try {
    const ctx = getAudioContext()
    
    // Resume if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    const now = ctx.currentTime

    // First tone (higher)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(880, now)
    gain1.gain.setValueAtTime(0.3, now)
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.3)

    // Second tone (even higher, slight delay)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1100, now + 0.15)
    gain2.gain.setValueAtTime(0, now)
    gain2.gain.setValueAtTime(0.25, now + 0.15)
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.5)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.15)
    osc2.stop(now + 0.5)
  } catch (err) {
    // Silently fail if audio isn't available
    console.warn('Could not play notification sound:', err)
  }
}
