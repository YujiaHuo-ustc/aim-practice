export function playHitSound(enabled: boolean) {
  if (!enabled) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(680, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.045);
  gain.gain.setValueAtTime(0.08, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.08);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.09);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
