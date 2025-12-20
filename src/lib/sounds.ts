// Simple audio utility for UI feedback sounds using Web Audio API
// Creates tiny blip/bop sounds without requiring audio files

let audioContext: AudioContext | null = null;

// Lazily initialize AudioContext (must be after user interaction)
const getAudioContext = (): AudioContext | null => {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      console.warn('Web Audio API not supported');
      return null;
    }
  }
  return audioContext;
};

// Resume audio context if it's suspended (required for mobile browsers)
const ensureAudioContextResumed = async () => {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // Ignore resume errors
    }
  }
};

type SoundType = 'blip' | 'bop' | 'click' | 'toggle' | 'success' | 'error';

interface SoundConfig {
  frequency: number;
  duration: number;
  type: OscillatorType;
  volume: number;
  ramp?: 'up' | 'down' | 'updown';
}

const SOUND_CONFIGS: Record<SoundType, SoundConfig> = {
  // Tiny high-pitched blip for UI interactions
  blip: {
    frequency: 800,
    duration: 0.05,
    type: 'sine',
    volume: 0.1,
    ramp: 'down',
  },
  // Slightly lower bop for confirmations
  bop: {
    frequency: 600,
    duration: 0.06,
    type: 'sine',
    volume: 0.1,
    ramp: 'down',
  },
  // Quick click for buttons
  click: {
    frequency: 1000,
    duration: 0.03,
    type: 'square',
    volume: 0.05,
    ramp: 'down',
  },
  // Toggle switch sound (two-tone)
  toggle: {
    frequency: 700,
    duration: 0.04,
    type: 'sine',
    volume: 0.08,
    ramp: 'updown',
  },
  // Success sound
  success: {
    frequency: 880,
    duration: 0.1,
    type: 'sine',
    volume: 0.1,
    ramp: 'up',
  },
  // Error/warning sound
  error: {
    frequency: 300,
    duration: 0.15,
    type: 'sawtooth',
    volume: 0.08,
    ramp: 'down',
  },
};

// Play a sound effect
export const playSound = async (soundType: SoundType = 'blip'): Promise<void> => {
  await ensureAudioContextResumed();
  const ctx = getAudioContext();
  if (!ctx) return;

  const config = SOUND_CONFIGS[soundType];
  const now = ctx.currentTime;

  // Create oscillator
  const oscillator = ctx.createOscillator();
  oscillator.type = config.type;
  oscillator.frequency.setValueAtTime(config.frequency, now);

  // Create gain node for volume control and envelope
  const gainNode = ctx.createGain();

  // Set up volume envelope
  switch (config.ramp) {
    case 'up':
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(config.volume, now + config.duration * 0.3);
      gainNode.gain.linearRampToValueAtTime(0, now + config.duration);
      break;
    case 'updown':
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(config.volume, now + config.duration * 0.3);
      gainNode.gain.linearRampToValueAtTime(config.volume * 0.7, now + config.duration * 0.6);
      gainNode.gain.linearRampToValueAtTime(0, now + config.duration);
      break;
    case 'down':
    default:
      gainNode.gain.setValueAtTime(config.volume, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + config.duration);
      break;
  }

  // Connect and start
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + config.duration);
};

// Convenience functions for common sounds
export const playBlip = () => playSound('blip');
export const playBop = () => playSound('bop');
export const playClick = () => playSound('click');
export const playToggle = () => playSound('toggle');
export const playSuccess = () => playSound('success');
export const playError = () => playSound('error');

// Hook for using sounds in React components
import { useCallback } from 'react';

export const useSounds = () => {
  const blip = useCallback(() => playBlip(), []);
  const bop = useCallback(() => playBop(), []);
  const click = useCallback(() => playClick(), []);
  const toggle = useCallback(() => playToggle(), []);
  const success = useCallback(() => playSuccess(), []);
  const error = useCallback(() => playError(), []);

  return { blip, bop, click, toggle, success, error, playSound };
};
