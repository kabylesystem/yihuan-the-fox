import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface FrontierNebulaProps {
  center: THREE.Vector3;
  linkedTargets: THREE.Vector3[];
  active: boolean;
}

function NebulaLink({ start, end, intensity }: { start: THREE.Vector3; end: THREE.Vector3; intensity: number }) {
  const curve = useMemo(() => {
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.y += 0.5;
    return new THREE.CatmullRomCurve3([start, mid, end]);
  }, [start, end]);

  return (
    <mesh>
      <tubeGeometry args={[curve, 24, 0.015, 8, false]} />
      <meshBasicMaterial color="#67e8f9" transparent opacity={0.2 + intensity * 0.5} toneMapped={false} />
    </mesh>
  );
}

export function FrontierNebula({ center, linkedTargets, active }: FrontierNebulaProps) {
  const cloudRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const particleRefs = useRef<THREE.Mesh[]>([]);
  const progressRef = useRef(0);

  useFrame((state, delta) => {
    if (!active) {
      progressRef.current = 0;
      return;
    }

    progressRef.current = Math.min(1, progressRef.current + delta / 1.6);

    const growth = progressRef.current;
    const pulse = 0.75 + Math.sin(state.clock.getElapsedTime() * 2.1) * 0.2;

    if (cloudRef.current) {
      cloudRef.current.position.copy(center);
      cloudRef.current.scale.setScalar(0.34 + growth * 0.92);
      (cloudRef.current.material as THREE.MeshBasicMaterial).opacity = 0.07 + growth * 0.18;
    }

    if (coreRef.current) {
      coreRef.current.position.copy(center);
      const s = 0.08 + growth * 0.2 + pulse * 0.02;
      coreRef.current.scale.setScalar(s);
      (coreRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + growth * 0.9;
    }

    particleRefs.current.forEach((mesh, i) => {
      const angle = (i / Math.max(1, particleRefs.current.length)) * Math.PI * 2 + state.clock.getElapsedTime() * 0.15;
      const orbitRadius = 0.3 + growth * 0.6 + Math.sin(state.clock.getElapsedTime() * 0.7 + i) * 0.05;
      mesh.position.set(
        center.x + Math.cos(angle) * orbitRadius,
        center.y + Math.sin(angle * 1.3) * orbitRadius * 0.6,
        center.z + Math.sin(angle) * orbitRadius
      );
      const ps = 0.012 + growth * 0.02;
      mesh.scale.setScalar(ps);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.2 + growth * 0.55;
    });
  });

  if (!active) return null;

  return (
    <group>
      <mesh ref={cloudRef}>
        <sphereGeometry args={[0.8, 20, 20]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.15} toneMapped={false} />
      </mesh>

      <mesh ref={coreRef}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color="#dbf4ff" emissive="#38bdf8" emissiveIntensity={0.75} roughness={0.25} metalness={0.35} />
      </mesh>

      {Array.from({ length: 16 }).map((_, i) => (
        <mesh
          key={`nebula-particle-${i}`}
          ref={(node) => {
            if (node) particleRefs.current[i] = node;
          }}
        >
          <sphereGeometry args={[0.016, 8, 8]} />
          <meshBasicMaterial color="#67e8f9" transparent opacity={0.4} toneMapped={false} />
        </mesh>
      ))}

      {linkedTargets.map((target, idx) => (
        <NebulaLink key={`frontier-link-${idx}`} start={center} end={target} intensity={progressRef.current} />
      ))}
    </group>
  );
}
