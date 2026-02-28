import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';

const FX = {
  glow: '#55e3ff',
  glow2: '#baf8ff',
};

export function RelightPulseFX(props: {
  position: THREE.Vector3;
  pulse01: number;
  visible: boolean;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!props.visible) return;
    const p = props.pulse01;

    if (ringRef.current) {
      ringRef.current.scale.setScalar(0.6 + 2.2 * p);
      const m = ringRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.22 * (1 - p);
    }

    if (coreRef.current) {
      coreRef.current.scale.setScalar(0.7 + 0.6 * p);
      const m = coreRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.35 + 0.25 * (1 - p);
    }
  });

  if (!props.visible) return null;

  return (
    <group position={props.position}>
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.35, 18, 18]} />
        <meshBasicMaterial color={FX.glow2} transparent opacity={0.35} toneMapped={false} />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.6, 0.015, 10, 64]} />
        <meshBasicMaterial color={FX.glow} transparent opacity={0.2} toneMapped={false} />
      </mesh>
      <pointLight intensity={1.6} color={FX.glow} distance={5} />
    </group>
  );
}

export function FrontierNebulaFX(props: {
  position: THREE.Vector3;
  progress01: number;
  visible: boolean;
}) {
  const cloudRef = useRef<THREE.Mesh>(null);
  const pointsRef = useRef<THREE.Points>(null);

  const points = useMemo(() => {
    const count = 220;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = 1.0 + Math.random() * 2.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      seeds[i] = Math.random();
    }

    return { positions, seeds, count };
  }, []);

  useFrame((state) => {
    if (!props.visible) return;

    const t = state.clock.getElapsedTime();
    const p = props.progress01;

    if (cloudRef.current) {
      cloudRef.current.scale.setScalar(0.35 + 1.75 * p);
      const m = cloudRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.06 + 0.16 * p;
      cloudRef.current.rotation.y = t * 0.12;
    }

    if (pointsRef.current) {
      const m = pointsRef.current.material as THREE.PointsMaterial;
      m.opacity = 0.05 + 0.35 * p;
      pointsRef.current.rotation.y = t * 0.18;
      pointsRef.current.rotation.x = t * 0.11;
      pointsRef.current.scale.setScalar(0.4 + 0.95 * p);
    }
  });

  if (!props.visible) return null;

  return (
    <group position={props.position}>
      {/* Soft cloud */}
      <mesh ref={cloudRef}>
        <sphereGeometry args={[1.0, 28, 28]} />
        <meshBasicMaterial color={FX.glow} transparent opacity={0.0} toneMapped={false} depthWrite={false} />
      </mesh>

      {/* Particle gather */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={points.positions} count={points.count} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.06} color={FX.glow2} transparent opacity={0.0} depthWrite={false} toneMapped={false} />
      </points>

      <pointLight intensity={1.8} color={FX.glow2} distance={6} />
    </group>
  );
}

export function GlowingConnection(props: {
  from?: THREE.Vector3;
  to?: THREE.Vector3;
  visible: boolean;
  intensity01: number;
}) {
  const points = useMemo(() => {
    if (!props.from || !props.to) return null;
    const mid = props.from.clone().lerp(props.to, 0.5);
    mid.y += props.from.distanceTo(props.to) * 0.18;
    return [props.from, mid, props.to];
  }, [props.from?.x, props.from?.y, props.from?.z, props.to?.x, props.to?.y, props.to?.z]);

  if (!props.visible || !points) return null;

  return (
    <group>
      <Line
        points={points}
        color={FX.glow2}
        transparent
        opacity={0.18 + 0.55 * props.intensity01}
        lineWidth={1}
        dashed={false}
      />
      <Line
        points={points}
        color={FX.glow}
        transparent
        opacity={0.08 + 0.35 * props.intensity01}
        lineWidth={4}
        dashed={false}
      />
    </group>
  );
}
