import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import * as THREE from 'three';
import type { TrainingSettings } from './types';

interface AimSceneProps {
  settings: TrainingSettings;
  running: boolean;
  onShot: (hit: boolean, timeToHitMs?: number) => void;
  onTargetSpawn?: () => void;
}

const CAMERA_DISTANCE = 15;
const TARGET_DEPTH = -28;
const BACKDROP_DEPTH = TARGET_DEPTH - 1.8;
const BACKDROP_WIDTH = 220;
const BACKDROP_HEIGHT = 132;
const AIM_YAW_LIMIT = THREE.MathUtils.degToRad(58);
const AIM_PITCH_LIMIT = 0.72;
const MAX_POINTER_DELTA = 120;
const POINTER_LOCK_WARMUP_EVENTS = 2;
const MAX_TARGETS = 10;
const CS2_M_YAW_DEGREES = 0.022;

const BACKDROP_PALETTES: Record<
  string,
  {
    scene: string;
    wall: string;
    edge: string;
    fog: string;
  }
> = {
  '#f4f6f8': {
    scene: '#eef2f6',
    wall: '#f4f6f8',
    edge: '#d9e0e8',
    fog: '#eef2f6'
  },
  '#0f1620': {
    scene: '#090b0f',
    wall: '#0f1620',
    edge: '#0b1119',
    fog: '#090b0f'
  },
  '#0e4aa3': {
    scene: '#071a36',
    wall: '#0e4aa3',
    edge: '#0a2f68',
    fog: '#071a36'
  },
  '#9b1c2b': {
    scene: '#2a070c',
    wall: '#9b1c2b',
    edge: '#5f111b',
    fog: '#2a070c'
  }
};

function getBackdropPalette(backgroundColor: string) {
  return BACKDROP_PALETTES[backgroundColor] ?? BACKDROP_PALETTES['#0f1620'];
}

function requestPointerLockForTraining(element: HTMLDivElement) {
  const requestPointerLock = element.requestPointerLock as (options?: {
    unadjustedMovement?: boolean;
  }) => Promise<void> | void;

  try {
    const result = requestPointerLock.call(element, { unadjustedMovement: true });
    if (result && typeof result.catch === 'function') {
      result.catch(() => element.requestPointerLock());
    }
  } catch {
    element.requestPointerLock();
  }
}

export default function AimScene({ settings, running, onShot, onTargetSpawn }: AimSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onShotRef = useRef(onShot);
  const onTargetSpawnRef = useRef(onTargetSpawn);
  const settingsRef = useRef(settings);
  const runningRef = useRef(running);
  const activeTargetCountRef = useRef(0);
  const syncTargetsRef = useRef<((forceRespawn?: boolean) => void) | null>(null);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);

  const crosshairStyle = useMemo(
    () =>
      ({
        '--crosshair-size': `${settings.crosshairSize}px`,
        '--crosshair-color': settings.crosshairColor
      }) as CSSProperties,
    [settings.crosshairColor, settings.crosshairSize]
  );

  useEffect(() => {
    onShotRef.current = onShot;
    onTargetSpawnRef.current = onTargetSpawn;
    settingsRef.current = settings;
    runningRef.current = running;
  }, [onShot, onTargetSpawn, running, settings]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerEl = container;

    const scene = new THREE.Scene();
    const initialPalette = getBackdropPalette(settingsRef.current.backgroundColor);
    scene.background = new THREE.Color(initialPalette.scene);
    scene.fog = new THREE.Fog(initialPalette.fog, 70, 145);

    const camera = new THREE.PerspectiveCamera(68, containerEl.clientWidth / containerEl.clientHeight, 0.1, 180);
    camera.position.set(0, 0, CAMERA_DISTANCE);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
    containerEl.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight('#d8e5ff', 1.2);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight('#ffffff', 2.2);
    directional.position.set(4, 8, 8);
    scene.add(directional);

    const wallGeometry = new THREE.PlaneGeometry(BACKDROP_WIDTH, BACKDROP_HEIGHT, 28, 18);
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: initialPalette.wall,
      roughness: 0.86,
      metalness: 0.08
    });
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.z = BACKDROP_DEPTH;
    scene.add(wall);

    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: initialPalette.edge,
      roughness: 0.9,
      metalness: 0.04,
      side: THREE.DoubleSide
    });
    const sideGeometry = new THREE.PlaneGeometry(92, BACKDROP_HEIGHT, 10, 18);
    const leftWall = new THREE.Mesh(sideGeometry, edgeMaterial);
    leftWall.position.set(-BACKDROP_WIDTH / 2, 0, BACKDROP_DEPTH + 38);
    leftWall.rotation.y = Math.PI / 2;
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(sideGeometry, edgeMaterial);
    rightWall.position.set(BACKDROP_WIDTH / 2, 0, BACKDROP_DEPTH + 38);
    rightWall.rotation.y = -Math.PI / 2;
    scene.add(rightWall);

    const targetGeometry = new THREE.SphereGeometry(1, 48, 32);
    const targetMaterial = new THREE.MeshStandardMaterial({
      color: settingsRef.current.targetColor,
      emissive: settingsRef.current.targetColor,
      emissiveIntensity: 0.35,
      roughness: 0.45,
      metalness: 0.1
    });
    const targets = Array.from({ length: MAX_TARGETS }, () => {
      const target = new THREE.Mesh(targetGeometry, targetMaterial);
      target.visible = false;
      scene.add(target);
      return target;
    });

    const reticleRaycaster = new THREE.Raycaster();
    const direction = new THREE.Vector3();
    const rayOrigin = new THREE.Vector3();
    const targetSpawnedAt = new Map<object, number>();
    type TargetMesh = (typeof targets)[number];
    let lastTargetPosition = new THREE.Vector3(999, 999, 999);
    let pendingYawDelta = 0;
    let pendingPitchDelta = 0;
    let ignoredPointerMoves = 0;
    let animationFrame = 0;
    let resizeFrame = 0;

    function getTargetCount() {
      return THREE.MathUtils.clamp(Math.round(settingsRef.current.targetCount), 1, MAX_TARGETS);
    }

    function getSpawnPosition(targetToIgnore: TargetMesh) {
      const { spawnRange, targetSize } = settingsRef.current;
      const maxX = THREE.MathUtils.mapLinear(spawnRange, 20, 60, 6.2, 15.8);
      const maxY = THREE.MathUtils.mapLinear(spawnRange, 20, 60, 3.8, 8.9);
      const next = new THREE.Vector3();

      for (let i = 0; i < 20; i += 1) {
        next.set(
          THREE.MathUtils.randFloatSpread(maxX * 2),
          THREE.MathUtils.randFloatSpread(maxY * 2),
          TARGET_DEPTH
        );
        const clearOfLastTarget = next.distanceTo(lastTargetPosition) > targetSize * 3.2;
        const clearOfVisibleTargets = targets.every(
          (target) =>
            target === targetToIgnore ||
            !target.visible ||
            next.distanceTo(target.position) > targetSize * 2.6
        );

        if (clearOfLastTarget && clearOfVisibleTargets) break;
      }

      lastTargetPosition = next.clone();
      return next;
    }

    function spawnTarget(target: TargetMesh) {
      const { targetSize } = settingsRef.current;
      const next = getSpawnPosition(target);
      target.position.copy(next);
      target.scale.setScalar(targetSize);
      target.visible = true;
      targetSpawnedAt.set(target, performance.now());
      onTargetSpawnRef.current?.();
    }

    function syncTargets(forceRespawn = false) {
      const targetCount = getTargetCount();
      if (!forceRespawn && targetCount === activeTargetCountRef.current) return;

      targets.forEach((target, index) => {
        if (index < targetCount) {
          if (forceRespawn || !target.visible) {
            spawnTarget(target);
          }
          return;
        }

        target.visible = false;
        targetSpawnedAt.delete(target);
      });

      activeTargetCountRef.current = targetCount;
    }

    syncTargetsRef.current = syncTargets;

    function updateCamera() {
      camera.rotation.order = 'YXZ';
      camera.rotation.y = yawRef.current;
      camera.rotation.x = pitchRef.current;
    }

    function handlePointerMove(event: MouseEvent) {
      if (!runningRef.current || document.pointerLockElement !== containerEl) return;
      if (ignoredPointerMoves > 0) {
        ignoredPointerMoves -= 1;
        return;
      }

      pendingYawDelta += THREE.MathUtils.clamp(event.movementX, -MAX_POINTER_DELTA, MAX_POINTER_DELTA);
      pendingPitchDelta += THREE.MathUtils.clamp(event.movementY, -MAX_POINTER_DELTA, MAX_POINTER_DELTA);
    }

    function applyPointerInput() {
      if (pendingYawDelta === 0 && pendingPitchDelta === 0) return;

      const sensitivity = settingsRef.current.sensitivity * THREE.MathUtils.degToRad(CS2_M_YAW_DEGREES);
      yawRef.current -= pendingYawDelta * sensitivity;
      pitchRef.current -= pendingPitchDelta * sensitivity;
      yawRef.current = THREE.MathUtils.clamp(yawRef.current, -AIM_YAW_LIMIT, AIM_YAW_LIMIT);
      pitchRef.current = THREE.MathUtils.clamp(pitchRef.current, -AIM_PITCH_LIMIT, AIM_PITCH_LIMIT);
      pendingYawDelta = 0;
      pendingPitchDelta = 0;
      updateCamera();
    }

    function handlePointerDown(event: MouseEvent) {
      if (!runningRef.current) return;
      if (document.pointerLockElement !== containerEl) {
        requestPointerLockForTraining(containerEl);
        return;
      }
      if (event.button !== 0) return;

      camera.getWorldDirection(direction);
      rayOrigin.setFromMatrixPosition(camera.matrixWorld);
      reticleRaycaster.set(rayOrigin, direction);
      const visibleTargets = targets.filter((target) => target.visible);
      const intersects = reticleRaycaster.intersectObjects(visibleTargets, false);
      const hitTarget = intersects[0]?.object as TargetMesh | undefined;
      const hit = Boolean(hitTarget);

      if (hitTarget) {
        const shotAt = performance.now();
        const timeToHitMs = Math.round(shotAt - (targetSpawnedAt.get(hitTarget) ?? shotAt));
        onShotRef.current(true, timeToHitMs);
        spawnTarget(hitTarget);
      } else {
        onShotRef.current(false);
      }
    }

    function handleResize() {
      if (containerEl.clientWidth === 0 || containerEl.clientHeight === 0) return;
      camera.aspect = containerEl.clientWidth / containerEl.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
    }

    function scheduleResize() {
      if (resizeFrame) {
        window.cancelAnimationFrame(resizeFrame);
      }

      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        handleResize();
      });
    }

    function handlePointerLockChange() {
      pendingYawDelta = 0;
      pendingPitchDelta = 0;
      ignoredPointerMoves = document.pointerLockElement === containerEl ? POINTER_LOCK_WARMUP_EVENTS : 0;
    }

    function animate() {
      applyPointerInput();
      syncTargets();
      const backdropPalette = getBackdropPalette(settingsRef.current.backgroundColor);
      scene.background = new THREE.Color(backdropPalette.scene);
      scene.fog.color.set(backdropPalette.fog);
      wallMaterial.color.set(backdropPalette.wall);
      edgeMaterial.color.set(backdropPalette.edge);
      targetMaterial.color.set(settingsRef.current.targetColor);
      targetMaterial.emissive.set(settingsRef.current.targetColor);
      targets.forEach((target) => {
        if (!target.visible) return;
        target.scale.setScalar(settingsRef.current.targetSize);
        target.rotation.y += 0.018;
        target.rotation.x += 0.01;
      });
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    }

    syncTargets(true);
    updateCamera();
    animate();

    containerEl.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('mousemove', handlePointerMove);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    window.addEventListener('resize', scheduleResize);
    const resizeObserver = new ResizeObserver(scheduleResize);
    resizeObserver.observe(containerEl);
    scheduleResize();

    return () => {
      cancelAnimationFrame(animationFrame);
      if (resizeFrame) {
        window.cancelAnimationFrame(resizeFrame);
      }
      containerEl.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('mousemove', handlePointerMove);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      window.removeEventListener('resize', scheduleResize);
      resizeObserver.disconnect();
      renderer.dispose();
      targetGeometry.dispose();
      targetMaterial.dispose();
      wallGeometry.dispose();
      wallMaterial.dispose();
      sideGeometry.dispose();
      edgeMaterial.dispose();
      syncTargetsRef.current = null;
      containerEl.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    let pointerLockFrame = 0;

    if (running) {
      yawRef.current = 0;
      pitchRef.current = 0;
      syncTargetsRef.current?.(true);
      if (containerRef.current) {
        pointerLockFrame = window.requestAnimationFrame(() => {
          pointerLockFrame = window.requestAnimationFrame(() => {
            if (runningRef.current && containerRef.current) {
              requestPointerLockForTraining(containerRef.current);
            }
          });
        });
      }
    } else if (document.pointerLockElement === containerRef.current) {
      document.exitPointerLock();
    }

    return () => {
      if (pointerLockFrame) {
        window.cancelAnimationFrame(pointerLockFrame);
      }
    };
  }, [running]);

  return (
    <div ref={containerRef} className="scene" style={crosshairStyle}>
      <div className="crosshair" />
      {!running && <div className="sceneVeil">点击开始后，鼠标会锁定在训练场内</div>}
    </div>
  );
}
