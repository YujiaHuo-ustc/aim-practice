export type SessionStatus = 'idle' | 'running' | 'complete';

export interface TrainingSettings {
  duration: number;
  targetSize: number;
  spawnRange: number;
  sensitivity: number;
  crosshairSize: number;
  crosshairColor: string;
  targetColor: string;
  soundEnabled: boolean;
}

export interface ShotEvent {
  id: string;
  hit: boolean;
  elapsedMs: number;
  timeToHitMs?: number;
}

export interface TrainingResult {
  id: string;
  startedAt: string;
  duration: number;
  hits: number;
  shots: number;
  accuracy: number;
  averageHitTime: number;
  bestHitTime: number;
  slowestHitTime: number;
  score: number;
}

export interface LiveStats {
  hits: number;
  shots: number;
  accuracy: number;
  averageHitTime: number;
  remainingTime: number;
  score: number;
}
