/**
 * Soft two-note chime played when a wizard step is saved.
 * Synthesised with Web Audio (no asset to load). The viewer can mute it; the
 * preference is a per-browser convenience, so storage failures are ignored.
 */

const MUTE_KEY = "venueSetup.soundMuted";

export function isSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Private mode / blocked storage: the toggle just won't persist.
  }
}

let ctx: AudioContext | null = null;

export function playSavedChime(): void {
  if (isSoundMuted()) return;
  try {
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    ctx ??= new AudioCtor();
    const now = ctx.currentTime;
    // E5 then A5, short and quiet.
    [659.25, 880].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      const start = now + i * 0.09;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.08, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch {
    // Audio is a nicety: never block the save flow.
  }
}
