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
const TARGET_DEPTH = -24;

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
  const targetRef = useRef<THREE.Mesh | null>(null);

  const crosshairStyle = useMemo(
    () => ({
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

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090b0f');
    scene.fog = new THREE.Fog('#090b0f', 28, 56);

    const camera = new THREE.PerspectiveCamera(68, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, CAMERA_DISTANCE);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight('#d8e5ff', 1.2);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight('#ffffff', 2.2);
    directional.position.set(4, 8, 8);
    scene.add(directional);

    const grid = new THREE.GridHelper(62, 31, '#283341', '#151d27');
    grid.position.y = -7.2;
    grid.position.z = -12;
    scene.add(grid);

    const wallGeometry = new THREE.PlaneGeometry(42, 24, 12, 8);
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: '#101722',
      roughness: 0.86,
      metalness: 0.08
    });
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.z = TARGET_DEPTH - 0.28;
    scene.add(wall);

    const rings = new THREE.Group();
    for (let radius = 3; radius <= 12; radius += 3) {
      const geometry = new THREE.RingGeometry(radius - 0.015, radius + 0.015, 96);
      const material = new THREE.MeshBasicMaterial({
        color: radius % 6 === 0 ? '#26364a' : '#1c2938',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65
      });
      const ring = new THREE.Mesh(geometry, material);
      ring.position.z = TARGET_DEPTH - 0.2;
      rings.add(ring);
    }
    scene.add(rings);

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
    let animationFrame = 0;

    function spawnTarget() {
      const { spawnRange, targetSize } = settingsRef.current;
      const maxX = THREE.MathUtils.mapLinear(spawnRange, 20, 60, 5.5, 13.4);
      const maxY = THREE.MathUtils.mapLinear(spawnRange, 20, 60, 3.3, 7.3);
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
      if (!runningRef.current || document.pointerLockElement !== container) return;
      const sensitivity = settingsRef.current.sensitivity * 0.0019;
      yawRef.current -= event.movementX * sensitivity;
      pitchRef.current -= event.movementY * sensitivity;
      pitchRef.current = THREE.MathUtils.clamp(pitchRef.current, -0.72, 0.72);
      updateCamera();
    }

    function handlePointerDown(event: MouseEvent) {
      if (!runningRef.current) return;
      if (document.pointerLockElement !== container) {
        container.requestPointerLock();
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
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    }

    function animate() {
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

    container.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrame);
      container.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      targetGeometry.dispose();
      targetMaterial.dispose();
      wallGeometry.dispose();
      wallMaterial.dispose();
      spawnTargetRef.current = null;
      container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    if (running) {
      yawRef.current = 0;
      pitchRef.current = 0;
      spawnTargetRef.current?.();
      containerRef.current?.requestPointerLock();
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
