import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const COLORS = {
  hull: '#6fd5ff',
  hullDark: '#1a4b6e',
  edge: '#c9f2ff',
  glow: '#4bdcff',
  glowSoft: '#7cf6ff',
};

export function NavigationShip(props: {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: number;
  thruster01: number;
  energyPulse01: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const thrusterRef = useRef<THREE.Mesh>(null);

  const materials = useMemo(() => {
    const hull = new THREE.MeshStandardMaterial({
      color: COLORS.hull,
      emissive: new THREE.Color('#06263b'),
      emissiveIntensity: 0.25,
      metalness: 0.7,
      roughness: 0.28,
    });

    const hullDark = new THREE.MeshStandardMaterial({
      color: COLORS.hullDark,
      emissive: new THREE.Color('#02121e'),
      emissiveIntensity: 0.18,
      metalness: 0.65,
      roughness: 0.35,
    });

    const edge = new THREE.MeshStandardMaterial({
      color: COLORS.edge,
      emissive: new THREE.Color(COLORS.glow),
      emissiveIntensity: 0.45,
      metalness: 0.75,
      roughness: 0.22,
    });

    const glow = new THREE.MeshBasicMaterial({
      color: COLORS.glow,
      transparent: true,
      opacity: 0.75,
      toneMapped: false,
    });

    const glowSoft = new THREE.MeshBasicMaterial({
      color: COLORS.glowSoft,
      transparent: true,
      opacity: 0.25,
      toneMapped: false,
      depthWrite: false,
    });

    return { hull, hullDark, edge, glow, glowSoft };
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    if (groupRef.current) {
      groupRef.current.position.copy(props.position);
      groupRef.current.quaternion.copy(props.quaternion);
      groupRef.current.scale.setScalar(props.scale);
    }

    if (thrusterRef.current) {
      const m = thrusterRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.25 + 0.55 * (0.35 + 0.65 * props.thruster01);
      thrusterRef.current.scale.setScalar(0.9 + 0.25 * props.thruster01);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Core fuselage */}
      <mesh material={materials.hull} rotation={[0, 0, 0]}>
        <capsuleGeometry args={[0.18, 0.55, 8, 14]} />
      </mesh>

      {/* Cockpit / canopy */}
      <mesh position={[0, 0.1, 0.22]} material={materials.edge}>
        <sphereGeometry args={[0.14, 16, 16]} />
      </mesh>

      {/* Wings (thin, sharp silhouette) */}
      <mesh position={[0.22, -0.02, 0.06]} rotation={[0, 0, Math.PI * 0.12]} material={materials.hullDark}>
        <boxGeometry args={[0.42, 0.04, 0.26]} />
      </mesh>
      <mesh position={[-0.22, -0.02, 0.06]} rotation={[0, 0, -Math.PI * 0.12]} material={materials.hullDark}>
        <boxGeometry args={[0.42, 0.04, 0.26]} />
      </mesh>

      {/* Nose tip */}
      <mesh position={[0, 0, 0.44]} rotation={[Math.PI / 2, 0, 0]} material={materials.edge}>
        <coneGeometry args={[0.11, 0.22, 14]} />
      </mesh>

      {/* Rear engine block */}
      <mesh position={[0, -0.02, -0.34]} material={materials.hullDark}>
        <boxGeometry args={[0.22, 0.12, 0.22]} />
      </mesh>

      {/* Twin thrusters */}
      <group position={[0, -0.02, -0.48]}>
        <mesh position={[0.07, 0, 0]} material={materials.edge}>
          <cylinderGeometry args={[0.05, 0.06, 0.12, 14]} />
        </mesh>
        <mesh position={[-0.07, 0, 0]} material={materials.edge}>
          <cylinderGeometry args={[0.05, 0.06, 0.12, 14]} />
        </mesh>

        {/* Thruster glow */}
        <mesh ref={thrusterRef} position={[0, 0, -0.11]} material={materials.glow}>
          <sphereGeometry args={[0.12, 10, 10]} />
        </mesh>
        <pointLight intensity={1.5} color={COLORS.glow} distance={2.6} />
      </group>
    </group>
  );
}
