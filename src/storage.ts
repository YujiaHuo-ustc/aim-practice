import type { TrainingResult, TrainingSettings } from './types';

const SETTINGS_KEY = 'aim-position-trainer.settings';
const HISTORY_KEY = 'aim-position-trainer.history';
const LEGACY_SENSITIVITY_FACTOR = 0.0019;
const CS2_M_YAW_DEGREES = 0.022;
const CS2_SENSITIVITY_FACTOR = CS2_M_YAW_DEGREES * (Math.PI / 180);

export const defaultSettings: TrainingSettings = {
  duration: 60,
  targetCount: 1,
  targetSize: 0.72,
  spawnRange: 42,
  sensitivity: 1,
  sensitivityMode: 'cs2',
  crosshairSize: 18,
  crosshairColor: '#f6f7fb',
  targetColor: '#ff4f5f',
  backgroundColor: '#0f1620',
  soundEnabled: true
};

export function loadSettings(): TrainingSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    const settings = { ...defaultSettings, ...parsed };

    if (parsed.sensitivityMode !== 'cs2') {
      settings.sensitivity = Number((settings.sensitivity * LEGACY_SENSITIVITY_FACTOR / CS2_SENSITIVITY_FACTOR).toFixed(2));
      settings.sensitivityMode = 'cs2';
    }

    return settings;
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
    return Array.isArray(parsed) ? normalizeHistory(parsed) : [];
  } catch {
    return [];
  }
}

export function saveResult(result: TrainingResult) {
  const history = normalizeHistory([result, ...loadHistory()]);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  return history;
}

function normalizeHistory(history: TrainingResult[]) {
  const seen = new Set<string>();

  return history
    .filter((result) => {
      const key = [
        result.startedAt,
        result.duration,
        result.hits,
        result.shots,
        result.accuracy,
        result.averageHitTime,
        result.score
      ].join('|');

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}
