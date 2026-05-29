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
  const targetSpawnedAtRef = useRef(performance.now());
  const spawnTargetRef = useRef<(() => void) | null>(null);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const targetRef = useRef<object | null>(null);

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
    scene.background = new THREE.Color('#090b0f');
    scene.fog = new THREE.Fog('#090b0f', 70, 145);

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
      color: '#0f1620',
      roughness: 0.86,
      metalness: 0.08
    });
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.z = BACKDROP_DEPTH;
    scene.add(wall);

    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: '#0b1119',
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
    const target = new THREE.Mesh(targetGeometry, targetMaterial);
    targetRef.current = target;
    scene.add(target);

    const reticleRaycaster = new THREE.Raycaster();
    const direction = new THREE.Vector3();
    const rayOrigin = new THREE.Vector3();
    let lastTargetPosition = new THREE.Vector3(999, 999, 999);
    let pendingYawDelta = 0;
    let pendingPitchDelta = 0;
    let ignoredPointerMoves = 0;
    let animationFrame = 0;

    function spawnTarget() {
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
        if (next.distanceTo(lastTargetPosition) > targetSize * 3.2) break;
      }

      lastTargetPosition = next.clone();
      target.position.copy(next);
      target.scale.setScalar(targetSize);
      target.visible = true;
      targetSpawnedAtRef.current = performance.now();
      onTargetSpawnRef.current?.();
    }

    spawnTargetRef.current = spawnTarget;

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

      const sensitivity = settingsRef.current.sensitivity * 0.0019;
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
      const intersects = reticleRaycaster.intersectObject(target, false);
      const hit = intersects.length > 0;

      if (hit) {
        const timeToHitMs = Math.round(performance.now() - targetSpawnedAtRef.current);
        onShotRef.current(true, timeToHitMs);
        spawnTarget();
      } else {
        onShotRef.current(false);
      }
    }

    function handleResize() {
      camera.aspect = containerEl.clientWidth / containerEl.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
    }

    function handlePointerLockChange() {
      pendingYawDelta = 0;
      pendingPitchDelta = 0;
      ignoredPointerMoves = document.pointerLockElement === containerEl ? POINTER_LOCK_WARMUP_EVENTS : 0;
    }

    function animate() {
      applyPointerInput();
      targetMaterial.color.set(settingsRef.current.targetColor);
      targetMaterial.emissive.set(settingsRef.current.targetColor);
      target.scale.setScalar(settingsRef.current.targetSize);
      target.rotation.y += 0.018;
      target.rotation.x += 0.01;
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    }

    spawnTarget();
    updateCamera();
    animate();

    containerEl.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('mousemove', handlePointerMove);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrame);
      containerEl.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('mousemove', handlePointerMove);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      targetGeometry.dispose();
      targetMaterial.dispose();
      wallGeometry.dispose();
      wallMaterial.dispose();
      sideGeometry.dispose();
      edgeMaterial.dispose();
      spawnTargetRef.current = null;
      containerEl.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    if (running) {
      yawRef.current = 0;
      pitchRef.current = 0;
      spawnTargetRef.current?.();
      if (containerRef.current) {
        requestPointerLockForTraining(containerRef.current);
      }
    } else if (document.pointerLockElement === containerRef.current) {
      document.exitPointerLock();
    }
  }, [running]);

  return (
    <div ref={containerRef} className="scene" style={crosshairStyle}>
      <div className="crosshair" />
      {!running && <div className="sceneVeil">点击开始后，鼠标会锁定在训练场内</div>}
    </div>
  );
}
