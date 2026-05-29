import type { ShotEvent, TrainingResult } from './types';

export function computeAccuracy(hits: number, shots: number) {
  return shots === 0 ? 0 : Math.round((hits / shots) * 1000) / 10;
}

export function computeAverageHitTime(events: ShotEvent[]) {
  const hitTimes = events
    .filter((event) => event.hit && typeof event.timeToHitMs === 'number')
    .map((event) => event.timeToHitMs as number);

  if (hitTimes.length === 0) return 0;
  return Math.round(hitTimes.reduce((sum, value) => sum + value, 0) / hitTimes.length);
}

export function computeScore(hits: number, shots: number, averageHitTime: number) {
  const accuracy = computeAccuracy(hits, shots);
  const speedPenalty = Math.max(0, averageHitTime - 350) * 0.08;
  const accuracyBonus = accuracy * 8;
  return Math.max(0, Math.round(hits * 100 + accuracyBonus - speedPenalty));
}

export function buildResult(startedAt: string, duration: number, events: ShotEvent[]): TrainingResult {
  const hits = events.filter((event) => event.hit).length;
  const shots = events.length;
  const hitTimes = events
    .filter((event) => event.hit && typeof event.timeToHitMs === 'number')
    .map((event) => event.timeToHitMs as number);
  const averageHitTime = computeAverageHitTime(events);

  return {
    id: crypto.randomUUID(),
    startedAt,
    duration,
    hits,
    shots,
    accuracy: computeAccuracy(hits, shots),
    averageHitTime,
    bestHitTime: hitTimes.length ? Math.min(...hitTimes) : 0,
    slowestHitTime: hitTimes.length ? Math.max(...hitTimes) : 0,
    score: computeScore(hits, shots, averageHitTime)
  };
}
