import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [elapsedBeforePauseMs, setElapsedBeforePauseMs] = useState(0);
  const [events, setEvents] = useState<ShotEvent[]>([]);
  const [lastResult, setLastResult] = useState<TrainingResult | null>(null);
  const [history, setHistory] = useState<TrainingResult[]>(() => loadHistory());
  const finishingRef = useRef(false);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (status !== 'running') return;

    const timer = window.setInterval(() => {
      const nextNow = performance.now();
      setNowMs(nextNow);

      if ((elapsedBeforePauseMs + nextNow - startMs) / 1000 >= settings.duration) {
        finishSession();
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [elapsedBeforePauseMs, settings.duration, startMs, status]);

  useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement && status === 'running' && !finishingRef.current) {
        pauseSession();
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [startMs, status]);

  useEffect(() => {
    function handlePointerLockChange() {
      if (!document.pointerLockElement && status === 'running' && !finishingRef.current) {
        pauseSession();
      }
    }

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
  }, [startMs, status]);

  const liveStats = useMemo(() => {
    const hits = events.filter((event) => event.hit).length;
    const shots = events.length;
    const averageHitTime = computeAverageHitTime(events);
    const elapsedMs =
      elapsedBeforePauseMs + (status === 'running' ? Math.max(0, nowMs - startMs) : 0);
    const remainingTime = Math.max(0, settings.duration - elapsedMs / 1000);

    return {
      hits,
      shots,
      accuracy: computeAccuracy(hits, shots),
      averageHitTime,
      remainingTime,
      score: computeScore(hits, shots, averageHitTime)
    };
  }, [elapsedBeforePauseMs, events, nowMs, settings.duration, startMs, status]);

  function updateSetting<K extends keyof TrainingSettings>(key: K, value: TrainingSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function startSession() {
    const now = performance.now();
    finishingRef.current = false;
    enterFullscreen();
    setEvents([]);
    setStartedAt(new Date().toISOString());
    setStartMs(now);
    setNowMs(now);
    setElapsedBeforePauseMs(0);
    setLastResult(null);
    setStatus('running');
  }

  function continueSession() {
    const now = performance.now();
    finishingRef.current = false;
    enterFullscreen();
    setStartMs(now);
    setNowMs(now);
    setStatus('running');
  }

  function pauseSession() {
    const pausedAt = performance.now();
    setStatus((current) => {
      if (current !== 'running') return current;
      setElapsedBeforePauseMs((elapsed) => elapsed + Math.max(0, pausedAt - startMs));
      setNowMs(pausedAt);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      return 'paused';
    });
  }

  function finishSession() {
    const finishedAt = performance.now();
    finishingRef.current = true;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    setStatus((current) => {
      if (current !== 'running' && current !== 'paused') return current;
      if (current === 'running') {
        setElapsedBeforePauseMs((elapsed) => elapsed + Math.max(0, finishedAt - startMs));
        setNowMs(finishedAt);
      }
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
    const elapsedMs = Math.round(elapsedBeforePauseMs + performance.now() - startMs);
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

  function returnToMenu() {
    finishingRef.current = false;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setStatus('idle');
    setLastResult(null);
    setEvents([]);
    setStartMs(0);
    setNowMs(0);
    setElapsedBeforePauseMs(0);
  }

  function enterFullscreen() {
    if (document.fullscreenElement) return;

    document.documentElement.requestFullscreen().catch(() => {
      // Fullscreen can be blocked outside direct user gestures; training still starts normally.
    });
  }

  const bestScore = history.reduce((best, result) => Math.max(best, result.score), 0);
  const sessionActive = status === 'running' || status === 'paused';

  return (
    <main className={status === 'running' ? 'app trainingMode' : 'app'}>
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
            disabled={sessionActive}
            onChange={(value) => updateSetting('duration', value)}
          />
          <RangeControl
            label="目标数量"
            value={settings.targetCount}
            min={1}
            max={10}
            step={1}
            suffix="个"
            disabled={sessionActive}
            onChange={(value) => updateSetting('targetCount', value)}
          />
          <RangeControl
            label="目标大小"
            value={settings.targetSize}
            min={0.18}
            max={2.4}
            step={0.01}
            suffix="x"
            disabled={sessionActive}
            onChange={(value) => updateSetting('targetSize', value)}
          />
          <RangeControl
            label="生成范围"
            value={settings.spawnRange}
            min={20}
            max={60}
            step={1}
            suffix="deg"
            disabled={sessionActive}
            onChange={(value) => updateSetting('spawnRange', value)}
          />
          <RangeControl
            label="CS2 灵敏度"
            value={settings.sensitivity}
            min={0.1}
            max={5}
            step={0.01}
            suffix=""
            disabled={sessionActive}
            onChange={(value) => updateSetting('sensitivity', value)}
          />
        </section>

        <section className="controlGroup">
          <div className="sectionTitle">显示</div>
          <ColorControl
            label="目标颜色"
            value={settings.targetColor}
            options={['#ff4f5f', '#00d1ff', '#ffd166', '#7ef29d']}
            disabled={sessionActive}
            onChange={(value) => updateSetting('targetColor', value)}
          />
          <ColorControl
            label="准星颜色"
            value={settings.crosshairColor}
            options={['#f6f7fb', '#39ff14', '#00d1ff', '#ffcc00']}
            disabled={sessionActive}
            onChange={(value) => updateSetting('crosshairColor', value)}
          />
          <ColorControl
            label="背景颜色"
            value={settings.backgroundColor}
            options={['#f4f6f8', '#0f1620', '#0e4aa3', '#9b1c2b']}
            disabled={sessionActive}
            onChange={(value) => updateSetting('backgroundColor', value)}
          />
          <RangeControl
            label="准星大小"
            value={settings.crosshairSize}
            min={10}
            max={32}
            step={1}
            suffix="px"
            disabled={sessionActive}
            onChange={(value) => updateSetting('crosshairSize', value)}
          />
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              disabled={sessionActive}
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
          ) : status === 'paused' ? (
            <>
              <button className="primaryButton" onClick={continueSession}>
                继续训练
              </button>
              <button className="ghostButton" onClick={finishSession}>
                结束训练
              </button>
            </>
          ) : (
            <button className="primaryButton" onClick={startSession}>
              开始训练
            </button>
          )}
          <button className="ghostButton" disabled={sessionActive} onClick={resetSettings}>
            重置参数
          </button>
        </div>
      </aside>

      <section className="trainingArea">
        <AimScene settings={settings} running={status === 'running'} onShot={handleShot} />
        {status === 'complete' && lastResult && (
          <ResultOverlay result={lastResult} onRestart={startSession} onReturnToMenu={returnToMenu} />
        )}
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftValue, setDraftValue] = useState(() => formatControlValue(value, step));

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraftValue(formatControlValue(value, step));
    }
  }, [step, value]);

  function commitValue(rawValue: string) {
    const parsedValue = Number(rawValue);

    if (!Number.isFinite(parsedValue)) {
      setDraftValue(formatControlValue(value, step));
      return;
    }

    const nextValue = normalizeControlValue(parsedValue, min, max, step);
    setDraftValue(formatControlValue(nextValue, step));
    onChange(nextValue);
  }

  return (
    <label className="rangeControl">
      <span>
        {label}
        <strong>
          {value}
          {suffix}
        </strong>
      </span>
      <div className="rangeAdjuster">
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <div className="numberInput">
          <input
            ref={inputRef}
            type="number"
            value={draftValue}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(event) => setDraftValue(event.target.value)}
            onBlur={(event) => commitValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
          />
          {suffix && <em>{suffix}</em>}
        </div>
      </div>
    </label>
  );
}

function normalizeControlValue(value: number, min: number, max: number, step: number) {
  const clampedValue = Math.min(max, Math.max(min, value));
  const steppedValue = Math.round((clampedValue - min) / step) * step + min;
  return Number(steppedValue.toFixed(getStepPrecision(step)));
}

function formatControlValue(value: number, step: number) {
  if (Number.isInteger(step)) {
    return String(Math.round(value));
  }

  return value.toFixed(getStepPrecision(step)).replace(/\.?0+$/, '');
}

function getStepPrecision(step: number) {
  const stepText = String(step);
  if (!stepText.includes('.')) return 0;
  return stepText.split('.')[1].length;
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

function ResultOverlay({
  result,
  onRestart,
  onReturnToMenu
}: {
  result: TrainingResult;
  onRestart: () => void;
  onReturnToMenu: () => void;
}) {
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
        <div className="resultActions">
          <button className="primaryButton" onClick={onRestart}>
            再练一局
          </button>
          <button className="ghostButton" onClick={onReturnToMenu}>
            回到菜单
          </button>
        </div>
      </div>
    </div>
  );
}
