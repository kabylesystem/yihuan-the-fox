import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FlightModePhase } from './flightTypes';

interface FlightShipProps {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  phase: FlightModePhase;
  appearProgress: number;
  thrust: number;
}

export function FlightShip({ position, lookAt, phase, appearProgress, thrust }: FlightShipProps) {
  const groupRef = useRef<THREE.Group>(null);
  const thrusterRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);

  const visible = phase !== 'hidden';

  const hoverOffset = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    if (!groupRef.current || !visible) return;

    const t = state.clock.getElapsedTime();
    const idleMode = phase === 'idle' || phase === 'choose' || phase === 'starcoreOpen';

    hoverOffset.set(0, 0, 0);
    if (idleMode) {
      hoverOffset.y = Math.sin(t * 1.2) * 0.07;
      hoverOffset.x = Math.sin(t * 0.65) * 0.05;
      hoverOffset.z = Math.cos(t * 0.8) * 0.04;
    }

    const settleScale = 0.8 + appearProgress * 0.2;
    groupRef.current.position.copy(position).add(hoverOffset);
    groupRef.current.lookAt(lookAt);
    groupRef.current.scale.setScalar(settleScale);

    const pulse = 0.55 + Math.sin(t * 2.4) * 0.2;
    const thrustBoost = thrust * 0.7;

    if (thrusterRef.current) {
      const s = 0.65 + pulse * 0.25 + thrustBoost;
      thrusterRef.current.scale.set(s * 0.85, s * 0.85, s * 1.6);
      (thrusterRef.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + pulse * 0.25 + thrustBoost * 0.4;
    }

    if (glowRef.current) {
      glowRef.current.intensity = 1.4 + pulse * 1.2 + thrustBoost * 3.2;
      glowRef.current.distance = 2.2 + thrustBoost * 2;
    }
  });

  if (!visible) return null;

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0, 0.12]}>
        <capsuleGeometry args={[0.13, 0.46, 8, 16]} />
        <meshStandardMaterial color="#d9f4ff" emissive="#89c6ff" emissiveIntensity={0.4} metalness={0.9} roughness={0.28} />
      </mesh>

      <mesh position={[0, 0.02, -0.2]}>
        <coneGeometry args={[0.1, 0.2, 12]} />
        <meshStandardMaterial color="#9dd7ff" emissive="#72beff" emissiveIntensity={0.6} metalness={0.8} roughness={0.3} />
      </mesh>

      <mesh position={[0, 0.04, 0.34]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshStandardMaterial color="#8fe3ff" emissive="#7dd3fc" emissiveIntensity={0.95} roughness={0.18} metalness={0.45} transparent opacity={0.92} />
      </mesh>

      <mesh position={[0.13, -0.01, 0.02]} rotation={[0.1, 0, -0.25]}>
        <boxGeometry args={[0.13, 0.02, 0.24]} />
        <meshStandardMaterial color="#8fc9ff" emissive="#3b82f6" emissiveIntensity={0.3} metalness={0.95} roughness={0.34} />
      </mesh>
      <mesh position={[-0.13, -0.01, 0.02]} rotation={[0.1, 0, 0.25]}>
        <boxGeometry args={[0.13, 0.02, 0.24]} />
        <meshStandardMaterial color="#8fc9ff" emissive="#3b82f6" emissiveIntensity={0.3} metalness={0.95} roughness={0.34} />
      </mesh>

      <mesh position={[0, -0.02, -0.33]}>
        <cylinderGeometry args={[0.055, 0.075, 0.11, 16]} />
        <meshStandardMaterial color="#6fa3d8" metalness={0.7} roughness={0.35} />
      </mesh>

      <mesh ref={thrusterRef} position={[0, -0.02, -0.43]}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshBasicMaterial color="#63cfff" transparent opacity={0.45} toneMapped={false} />
      </mesh>
      <pointLight ref={glowRef} position={[0, -0.02, -0.43]} color="#4ac8ff" intensity={2.2} distance={3} />
    </group>
  );
}
