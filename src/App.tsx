import { useEffect, useMemo, useState } from 'react';
import AimScene from './AimScene';
import { playHitSound } from './audio';
import { buildResult, computeAccuracy, computeAverageHitTime, computeScore } from './scoring';
import { defaultSettings, loadHistory, loadSettings, saveResult, saveSettings } from './storage';
import type { SessionStatus, ShotEvent, TrainingResult, TrainingSettings } from './types';

export default function App() {
  const [settings, setSettings] = useState<TrainingSettings>(() => loadSettings());
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [startedAt, setStartedAt] = useState<string>('');
  const [startMs, setStartMs] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const [events, setEvents] = useState<ShotEvent[]>([]);
  const [lastResult, setLastResult] = useState<TrainingResult | null>(null);
  const [history, setHistory] = useState<TrainingResult[]>(() => loadHistory());

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (status !== 'running') return;

    const timer = window.setInterval(() => {
      const nextNow = performance.now();
      setNowMs(nextNow);

      if ((nextNow - startMs) / 1000 >= settings.duration) {
        finishSession();
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [settings.duration, startMs, status]);

  const liveStats = useMemo(() => {
    const hits = events.filter((event) => event.hit).length;
    const shots = events.length;
    const averageHitTime = computeAverageHitTime(events);
    const elapsed = status === 'running' ? Math.max(0, (nowMs - startMs) / 1000) : 0;
    const remainingTime = status === 'running' ? Math.max(0, settings.duration - elapsed) : settings.duration;

    return {
      hits,
      shots,
      accuracy: computeAccuracy(hits, shots),
      averageHitTime,
      remainingTime,
      score: computeScore(hits, shots, averageHitTime)
    };
  }, [events, nowMs, settings.duration, startMs, status]);

  function updateSetting<K extends keyof TrainingSettings>(key: K, value: TrainingSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function startSession() {
    const now = performance.now();
    setEvents([]);
    setStartedAt(new Date().toISOString());
    setStartMs(now);
    setNowMs(now);
    setLastResult(null);
    setStatus('running');
  }

  function finishSession() {
    setStatus((current) => {
      if (current !== 'running') return current;
      setEvents((currentEvents) => {
        const result = buildResult(startedAt || new Date().toISOString(), settings.duration, currentEvents);
        setLastResult(result);
        setHistory(saveResult(result));
        return currentEvents;
      });
      return 'complete';
    });
  }

  function handleShot(hit: boolean, timeToHitMs?: number) {
    const elapsedMs = Math.round(performance.now() - startMs);
    setEvents((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        hit,
        elapsedMs,
        timeToHitMs
      }
    ]);

    if (hit) {
      playHitSound(settings.soundEnabled);
    }
  }

  function resetSettings() {
    setSettings(defaultSettings);
  }

  const bestScore = history.reduce((best, result) => Math.max(best, result.score), 0);

  return (
    <main className="app">
      <aside className="panel leftPanel">
        <div>
          <p className="eyebrow">Aim Position Trainer</p>
          <h1>定位靶场</h1>
        </div>

        <section className="controlGroup">
          <div className="sectionTitle">训练参数</div>
          <RangeControl
            label="时长"
            value={settings.duration}
            min={20}
            max={120}
            step={10}
            suffix="秒"
            disabled={status === 'running'}
            onChange={(value) => updateSetting('duration', value)}
          />
          <RangeControl
            label="目标大小"
            value={settings.targetSize}
            min={0.38}
            max={1.15}
            step={0.01}
            suffix="x"
            disabled={status === 'running'}
            onChange={(value) => updateSetting('targetSize', value)}
          />
          <RangeControl
            label="生成范围"
            value={settings.spawnRange}
            min={20}
            max={60}
            step={1}
            suffix="deg"
            disabled={status === 'running'}
            onChange={(value) => updateSetting('spawnRange', value)}
          />
          <RangeControl
            label="灵敏度"
            value={settings.sensitivity}
            min={0.06}
            max={0.32}
            step={0.01}
            suffix=""
            disabled={status === 'running'}
            onChange={(value) => updateSetting('sensitivity', value)}
          />
        </section>

        <section className="controlGroup">
          <div className="sectionTitle">显示</div>
          <ColorControl
            label="目标颜色"
            value={settings.targetColor}
            options={['#ff4f5f', '#00d1ff', '#ffd166', '#7ef29d']}
            disabled={status === 'running'}
            onChange={(value) => updateSetting('targetColor', value)}
          />
          <ColorControl
            label="准星颜色"
            value={settings.crosshairColor}
            options={['#f6f7fb', '#39ff14', '#00d1ff', '#ffcc00']}
            disabled={status === 'running'}
            onChange={(value) => updateSetting('crosshairColor', value)}
          />
          <RangeControl
            label="准星大小"
            value={settings.crosshairSize}
            min={10}
            max={32}
            step={1}
            suffix="px"
            disabled={status === 'running'}
            onChange={(value) => updateSetting('crosshairSize', value)}
          />
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              disabled={status === 'running'}
              onChange={(event) => updateSetting('soundEnabled', event.target.checked)}
            />
            <span>命中音效</span>
          </label>
        </section>

        <div className="actions">
          {status === 'running' ? (
            <button className="primaryButton danger" onClick={finishSession}>
              结束训练
            </button>
          ) : (
            <button className="primaryButton" onClick={startSession}>
              开始训练
            </button>
          )}
          <button className="ghostButton" disabled={status === 'running'} onClick={resetSettings}>
            重置参数
          </button>
        </div>
      </aside>

      <section className="trainingArea">
        <AimScene settings={settings} running={status === 'running'} onShot={handleShot} />
        {status === 'complete' && lastResult && <ResultOverlay result={lastResult} onRestart={startSession} />}
      </section>

      <aside className="panel rightPanel">
        <div className="statHeader">
          <span>实时数据</span>
          <strong>{Math.ceil(liveStats.remainingTime)}s</strong>
        </div>

        <div className="statGrid">
          <Stat label="命中" value={liveStats.hits} />
          <Stat label="射击" value={liveStats.shots} />
          <Stat label="命中率" value={`${liveStats.accuracy}%`} />
          <Stat label="平均定位" value={`${liveStats.averageHitTime}ms`} />
          <Stat label="当前分" value={liveStats.score} />
          <Stat label="最佳分" value={bestScore} />
        </div>

        <section className="history">
          <div className="sectionTitle">最近成绩</div>
          {history.length === 0 ? (
            <p className="empty">完成一局后会显示历史记录。</p>
          ) : (
            <ol>
              {history.slice(0, 6).map((result) => (
                <li key={result.id}>
                  <div>
                    <strong>{result.score}</strong>
                    <span>{new Date(result.startedAt).toLocaleString()}</span>
                  </div>
                  <em>
                    {result.hits}/{result.shots} · {result.accuracy}%
                  </em>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </main>
  );
}

interface RangeControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function RangeControl({ label, value, min, max, step, suffix, disabled, onChange }: RangeControlProps) {
  return (
    <label className="rangeControl">
      <span>
        {label}
        <strong>
          {value}
          {suffix}
        </strong>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

interface ColorControlProps {
  label: string;
  value: string;
  options: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}

function ColorControl({ label, value, options, disabled, onChange }: ColorControlProps) {
  return (
    <div className="colorControl">
      <span>{label}</span>
      <div>
        {options.map((color) => (
          <button
            key={color}
            className={value === color ? 'swatch active' : 'swatch'}
            style={{ backgroundColor: color }}
            disabled={disabled}
            aria-label={color}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ResultOverlay({ result, onRestart }: { result: TrainingResult; onRestart: () => void }) {
  return (
    <div className="resultOverlay">
      <div className="resultPanel">
        <p className="eyebrow">训练结束</p>
        <h2>{result.score}</h2>
        <div className="resultStats">
          <Stat label="命中" value={`${result.hits}/${result.shots}`} />
          <Stat label="命中率" value={`${result.accuracy}%`} />
          <Stat label="平均定位" value={`${result.averageHitTime}ms`} />
          <Stat label="最快定位" value={`${result.bestHitTime}ms`} />
        </div>
        <button className="primaryButton" onClick={onRestart}>
          再练一局
        </button>
      </div>
    </div>
  );
}
