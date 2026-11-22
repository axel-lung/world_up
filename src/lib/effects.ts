import { Capacitor } from '@capacitor/core';
import { useSyncExternalStore } from 'react';
import { isNativeApp } from '@/lib/native-app';
import type { Rarity } from '@/lib/rarity';

// The game's sounds and vibrations (decided on 2026-11-22): the pack opening
// and the streak screen. The sounds are synthesized in the browser with Web
// Audio, from no file; the vibrations go through the app's Haptics plugin, or
// the browser's Vibration API (Android browsers; an older app, without the
// plugin, has none). One switch turns both off, per device: the opening's
// stage and the profile show it. Browser side only.

export type EffectName = 'charge' | 'burst' | 'flip' | 'suspense' | 'reveal' | 'done' | 'streak';

// A per-device convenience (localStorage): "off" when the player turned them off
const STORAGE_KEY = 'worldup-effects';
const CHANGE_EVENT = 'worldup-effects-change';

export function effectsOn(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setEffectsOn(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, 'off');
  } catch {
    // Storage blocked: the switch lasts as long as the page
    memory = on;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

let memory: boolean | null = null;
const current = () => memory ?? effectsOn();

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Whether sounds and vibrations are on, following the switch on every component. */
export function useEffectsOn(): boolean {
  return useSyncExternalStore(subscribe, current, () => true);
}

// — Sound —

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

/** The page's audio context, created on the first effect: a touch has started it. */
function audio(): { ctx: AudioContext; out: GainNode } | null {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  if (!context) {
    context = new Context();
    master = context.createGain();
    master.gain.value = 0.55;
    const limiter = context.createDynamicsCompressor();
    master.connect(limiter).connect(context.destination);
  }
  if (context.state === 'suspended') void context.resume();
  return { ctx: context, out: master! };
}

interface ToneOptions {
  freq: number;
  /** Seconds from now. */
  at?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Slides to this frequency over the duration. */
  to?: number;
  attack?: number;
}

function tone({ ctx, out }: { ctx: AudioContext; out: GainNode }, options: ToneOptions) {
  const { freq, at = 0, duration, type = 'sine', gain = 0.2, to, attack = 0.01 } = options;
  const start = ctx.currentTime + at;
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, start);
  if (to) oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.linearRampToValueAtTime(gain, start + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope).connect(out);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

interface NoiseOptions {
  at?: number;
  duration: number;
  gain?: number;
  filter: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
  /** Rises to its gain over the whole duration instead of falling from it. */
  swell?: boolean;
}

function noise({ ctx, out }: { ctx: AudioContext; out: GainNode }, options: NoiseOptions) {
  const { at = 0, duration, gain = 0.2, filter, freq, to, q = 1, swell = false } = options;
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const start = ctx.currentTime + at;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  const band = ctx.createBiquadFilter();
  band.type = filter;
  band.Q.value = q;
  band.frequency.setValueAtTime(freq, start);
  if (to) band.frequency.exponentialRampToValueAtTime(to, start + duration);
  const envelope = ctx.createGain();
  if (swell) {
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + duration);
    envelope.gain.linearRampToValueAtTime(0.0001, start + duration + 0.04);
  } else {
    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  }
  source.connect(band).connect(envelope).connect(out);
  source.start(start);
  source.stop(start + duration + 0.06);
}

// A major pentatonic from C5: the chimes climb it with the rarity
const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];

const CHIMES: Record<Rarity, number[]> = {
  common: [2],
  uncommon: [2, 3],
  rare: [0, 2, 3],
  super: [0, 2, 3, 5],
  ultra: [0, 2, 3, 5, 7],
  legendary: [0, 2, 3, 5, 7, 8],
};

function shimmer(out: { ctx: AudioContext; out: GainNode }, at: number, count: number) {
  for (let i = 0; i < count; i++) {
    tone(out, { freq: 2000 + Math.random() * 1600, at: at + i * 0.045, duration: 0.12, type: 'sine', gain: 0.05 });
  }
}

function playSound(name: EffectName, rarity: Rarity | undefined) {
  const out = audio();
  if (!out) return;
  switch (name) {
    case 'charge':
      // The pack strains: a rising rush of air over a rumble
      noise(out, { duration: 1, gain: 0.16, filter: 'bandpass', freq: 300, to: 2600, q: 1.4, swell: true });
      tone(out, { freq: 55, to: 110, duration: 1, type: 'triangle', gain: 0.18, attack: 0.3 });
      return;
    case 'burst':
      // Torn paper, a pop, then sparks
      noise(out, { duration: 0.28, gain: 0.45, filter: 'highpass', freq: 1400, q: 0.7 });
      noise(out, { at: 0.05, duration: 0.18, gain: 0.25, filter: 'bandpass', freq: 3200, q: 2 });
      tone(out, { freq: 190, to: 55, duration: 0.3, type: 'sine', gain: 0.5, attack: 0.005 });
      shimmer(out, 0.12, 6);
      return;
    case 'flip':
      noise(out, { duration: 0.09, gain: 0.22, filter: 'bandpass', freq: 2400, to: 900, q: 1.2 });
      return;
    case 'suspense':
      // A legendary trembles: a low growl that swells
      tone(out, { freq: 48, to: 72, duration: 0.75, type: 'sawtooth', gain: 0.09, attack: 0.2 });
      noise(out, { duration: 0.75, gain: 0.12, filter: 'lowpass', freq: 300, to: 900, swell: true });
      return;
    case 'reveal': {
      const steps = CHIMES[rarity ?? 'common'];
      const big = steps.length >= 4;
      steps.forEach((step, i) =>
        tone(out, { freq: NOTES[step], at: i * 0.07, duration: big ? 0.6 : 0.35, type: 'triangle', gain: 0.16 }),
      );
      if (big) shimmer(out, steps.length * 0.07, steps.length + 2);
      if (rarity === 'legendary') {
        // A boom under a held chord
        tone(out, { freq: 70, to: 38, duration: 0.9, type: 'sine', gain: 0.55, attack: 0.005 });
        [261.63, 329.63, 392, 523.25].forEach((freq) =>
          tone(out, { freq, at: 0.42, duration: 1.4, type: 'sine', gain: 0.07, attack: 0.08 }),
        );
      }
      return;
    }
    case 'done':
      tone(out, { freq: NOTES[3], duration: 0.3, type: 'triangle', gain: 0.1 });
      tone(out, { freq: NOTES[5], at: 0.09, duration: 0.45, type: 'triangle', gain: 0.1 });
      return;
    case 'streak':
      [0, 2, 3, 5, 7].forEach((step, i) =>
        tone(out, { freq: NOTES[step], at: i * 0.09, duration: 0.5, type: 'triangle', gain: 0.14 }),
      );
      shimmer(out, 0.45, 6);
      return;
  }
}

// — Vibration —

// Milliseconds: on, off, on...
const VIBRATIONS: Partial<Record<EffectName, number[]>> = {
  charge: [12, 90, 16, 70, 20, 50, 26, 30, 32],
  burst: [45],
  flip: [8],
  suspense: [18, 40, 22, 35, 28, 30, 34, 25, 44],
  streak: [20, 60, 30, 60, 50],
};

const REVEAL_VIBRATIONS: Record<Rarity, number[] | null> = {
  common: null,
  uncommon: null,
  rare: [12],
  super: [22, 50, 22],
  ultra: [30, 50, 40],
  legendary: [70, 40, 100, 40, 150],
};

type HapticsPlugin = (typeof import('@capacitor/haptics'))['Haptics'];
let haptics: Promise<{ plugin: HapticsPlugin } | null> | undefined;

/** The app's Haptics plugin, or null in a browser or an app built without it. */
function nativeHaptics() {
  // Wrapped: a promise must never resolve to a Capacitor plugin (its then() would be a native call)
  haptics ??= (async () => {
    if (!isNativeApp() || !Capacitor.isPluginAvailable('Haptics')) return null;
    const { Haptics } = await import('@capacitor/haptics');
    return { plugin: Haptics };
  })().catch(() => null);
  return haptics;
}

async function vibrate(pattern: number[]) {
  const native = await nativeHaptics();
  if (native) {
    let at = 0;
    pattern.forEach((length, i) => {
      if (i % 2 === 0) window.setTimeout(() => void native.plugin.vibrate({ duration: length }).catch(() => {}), at);
      at += length;
    });
    return;
  }
  if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
}

/**
 * Plays an effect's sound and vibration, unless the player turned them off.
 * Call it from a touch or what follows one: browsers only start sound after one.
 */
export function playEffect(name: EffectName, rarity?: Rarity): void {
  if (typeof window === 'undefined' || !current()) return;
  try {
    playSound(name, rarity);
  } catch {
    // No sound on this device
  }
  const pattern = name === 'reveal' ? REVEAL_VIBRATIONS[rarity ?? 'common'] : VIBRATIONS[name];
  if (pattern) void vibrate(pattern).catch(() => {});
}
