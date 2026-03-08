const audioCtx = new AudioContext();

function playTone(frequency: number, duration: number, volume: number = 0.15) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.frequency.value = frequency;
  osc.type = 'sine';

  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + duration);
}

/** Short rising tone — recording started */
export function playStartSound() {
  playTone(600, 0.12);
  setTimeout(() => playTone(900, 0.12), 80);
}

/** Short falling tone — recording stopped, processing */
export function playStopSound() {
  playTone(900, 0.12);
  setTimeout(() => playTone(600, 0.15), 80);
}

/** Quick double-tap tone — translation triggered */
export function playTranslateSound() {
  playTone(800, 0.08, 0.12);
  setTimeout(() => playTone(1100, 0.1, 0.12), 60);
}
