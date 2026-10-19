// Bunyi beep sukses dan gagal untuk scan (PRD 4.8), dibuat dengan Web Audio tanpa file suara.

let context: AudioContext | null = null

function tone(frequency: number, startMs: number, durationMs: number) {
  try {
    context ??= new AudioContext()
    const osc = context.createOscillator()
    const volume = context.createGain()
    const t = context.currentTime + startMs / 1000
    osc.type = 'square'
    osc.frequency.value = frequency
    volume.gain.setValueAtTime(0.08, t)
    volume.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000)
    osc.connect(volume).connect(context.destination)
    osc.start(t)
    osc.stop(t + durationMs / 1000)
  } catch {
    // Browser tanpa audio: scan tetap jalan tanpa bunyi.
  }
}

export function playSuccess() {
  tone(1800, 0, 80)
}

export function playError() {
  tone(320, 0, 150)
  tone(240, 170, 180)
}
