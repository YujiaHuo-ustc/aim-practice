export type SessionStatus = 'idle' | 'running' | 'paused' | 'complete';

export interface TrainingSettings {
  sessionMode: 'time' | 'targets';
  duration: number;
  targetGoal: number;
  targetCount: number;
  targetSize: number;
  spawnRange: number;
  sensitivity: number;
  sensitivityMode: 'cs2';
  crosshairSize: number;
  crosshairColor: string;
  targetColor: string;
  backgroundColor: string;
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
  sessionMode: 'time' | 'targets';
  duration: number;
  elapsedSeconds: number;
  targetGoal?: number;
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
  elapsedSeconds: number;
  hitsPerMinute: number;
  remainingTargets: number;
  remainingTime: number;
  score: number;
  sessionMode: 'time' | 'targets';
  targetGoal: number;
  targetSpawns: number;
}
