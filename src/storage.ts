import type { TrainingResult, TrainingSettings } from './types';

const SETTINGS_KEY = 'aim-position-trainer.settings';
const HISTORY_KEY = 'aim-position-trainer.history';

export const defaultSettings: TrainingSettings = {
  duration: 60,
  targetSize: 0.72,
  spawnRange: 42,
  sensitivity: 0.16,
  crosshairSize: 18,
  crosshairColor: '#f6f7fb',
  targetColor: '#ff4f5f',
  soundEnabled: true
};

export function loadSettings(): TrainingSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: TrainingSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadHistory(): TrainingResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function saveResult(result: TrainingResult) {
  const history = [result, ...loadHistory()].slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  return history;
}
