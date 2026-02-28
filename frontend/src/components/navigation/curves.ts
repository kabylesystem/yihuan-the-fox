import * as THREE from 'three';

export function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

export function easeInOutCubic(t: number) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOutCubic(t: number) {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

export function bezier3(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, t: number) {
  const tt = clamp01(t);
  const a = p0.clone().lerp(p1, tt);
  const b = p1.clone().lerp(p2, tt);
  return a.lerp(b, tt);
}

export function makeTravelCurve(start: THREE.Vector3, end: THREE.Vector3) {
  const mid = start.clone().lerp(end, 0.5);
  const dist = start.distanceTo(end);

  // Subtle cinematic arc: lift slightly and bias forward
  const control = mid.clone();
  control.y += Math.min(3.2, 0.25 * dist);
  control.z += Math.min(2.0, 0.15 * dist);

  return { start: start.clone(), control, end: end.clone() };
}
