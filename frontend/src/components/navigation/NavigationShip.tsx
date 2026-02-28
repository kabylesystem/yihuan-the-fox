import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const COLORS = {
  hull: '#3aa6d6',
  hullDark: '#123a55',
  edge: '#bfefff',
  glass: '#7de7ff',
  glow: '#39d9ff',
  nose: '#ff4a4a',
  noseDark: '#3b0b0b',
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

  // Three's Object3D.lookAt points the object's -Z axis at the target.
  // This ship model is authored with its nose pointing +Z, so we flip it.
  const modelFacingFix = useMemo(() => {
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  }, []);

  // Keep the ship small and readable.
  const baseScale = 0.65;

  const materials = useMemo(() => {
    const hull = new THREE.MeshStandardMaterial({
      color: COLORS.hull,
      emissive: new THREE.Color('#021520'),
      emissiveIntensity: 0.14,
      metalness: 0.65,
      roughness: 0.42,
    });

    const hullDark = new THREE.MeshStandardMaterial({
      color: COLORS.hullDark,
      emissive: new THREE.Color('#02121e'),
      emissiveIntensity: 0.1,
      metalness: 0.6,
      roughness: 0.5,
    });

    const edge = new THREE.MeshStandardMaterial({
      color: COLORS.edge,
      emissive: new THREE.Color(COLORS.glow),
      emissiveIntensity: 0.22,
      metalness: 0.7,
      roughness: 0.35,
    });

    const nose = new THREE.MeshStandardMaterial({
      color: COLORS.nose,
      emissive: new THREE.Color(COLORS.noseDark),
      emissiveIntensity: 0.08,
      metalness: 0.25,
      roughness: 0.55,
    });

    const glass = new THREE.MeshStandardMaterial({
      color: COLORS.glass,
      emissive: new THREE.Color(COLORS.glow),
      emissiveIntensity: 0.22,
      metalness: 0.1,
      roughness: 0.15,
      transparent: true,
      opacity: 0.88,
    });

    const glow = new THREE.MeshBasicMaterial({
      color: COLORS.glow,
      transparent: true,
      opacity: 0.45,
      toneMapped: false,
    });

    return { hull, hullDark, edge, glass, glow, nose };
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    if (groupRef.current) {
      groupRef.current.position.copy(props.position);
      groupRef.current.quaternion.copy(props.quaternion).multiply(modelFacingFix);
      groupRef.current.scale.setScalar(props.scale * baseScale);
    }

    if (thrusterRef.current) {
      const m = thrusterRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.16 + 0.42 * (0.35 + 0.65 * props.thruster01);
      thrusterRef.current.scale.setScalar(0.85 + 0.18 * props.thruster01);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Rocket-like silhouette (reference): cone nose + cylinder body + window + fins */}
      <group>
        {/* Main body */}
        <mesh material={materials.hull}>
          <cylinderGeometry args={[0.18, 0.2, 0.75, 18, 1, false]} />
        </mesh>

        {/* Nose cone (sharper + red for readability) */}
        <mesh position={[0, 0, 0.58]} rotation={[Math.PI / 2, 0, 0]} material={materials.nose}>
          <coneGeometry args={[0.15, 0.52, 20]} />
        </mesh>
        {/* Tiny tip to avoid a visually flat cap */}
        <mesh position={[0, 0, 0.84]} rotation={[Math.PI / 2, 0, 0]} material={materials.nose}>
          <coneGeometry args={[0.06, 0.18, 20]} />
        </mesh>

        {/* Mid ring accent */}
        <mesh position={[0, 0, 0.08]} material={materials.hullDark}>
          <torusGeometry args={[0.195, 0.025, 10, 28]} />
        </mesh>

        {/* Window */}
        <mesh position={[0, 0.06, 0.33]} material={materials.glass}>
          <sphereGeometry args={[0.095, 18, 18]} />
        </mesh>

        {/* Fins */}
        <mesh position={[0.18, -0.12, -0.24]} rotation={[0, 0, Math.PI * 0.08]} material={materials.hullDark}>
          <boxGeometry args={[0.18, 0.08, 0.22]} />
        </mesh>
        <mesh position={[-0.18, -0.12, -0.24]} rotation={[0, 0, -Math.PI * 0.08]} material={materials.hullDark}>
          <boxGeometry args={[0.18, 0.08, 0.22]} />
        </mesh>

        {/* Engine nozzle */}
        <mesh position={[0, -0.03, -0.45]} material={materials.edge}>
          <cylinderGeometry args={[0.11, 0.14, 0.16, 16]} />
        </mesh>
        <mesh position={[0, -0.03, -0.56]} material={materials.hullDark}>
          <cylinderGeometry args={[0.08, 0.1, 0.1, 14]} />
        </mesh>

        {/* Thruster glow (subtle) */}
        <group position={[0, -0.03, -0.65]}>
          <mesh ref={thrusterRef} material={materials.glow}>
            <sphereGeometry args={[0.11, 10, 10]} />
          </mesh>
          <pointLight intensity={0.9} color={COLORS.glow} distance={2.2} />
        </group>
      </group>
    </group>
  );
}
