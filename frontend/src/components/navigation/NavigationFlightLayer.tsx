import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Neuron } from '../../types';
import { useNavigationFlightMachine } from './useNavigationFlightMachine';
import { NavigationShip } from './NavigationShip';
import { FrontierNebulaFX, GlowingConnection, RelightPulseFX } from './NavigationNebulaFX';
import { NavigationHUD } from './NavigationHUD';
import { StarcorePanel } from './StarcorePanel';

export function NavigationFlightLayer(props: {
  enabled: boolean;
  nodes: Neuron[];
  timePulse: number;
}) {
  const { camera, controls } = useThree() as any;

  const machine = useNavigationFlightMachine({
    enabled: props.enabled,
    nodes: props.nodes,
    timePulse: props.timePulse,
    camera: camera as THREE.PerspectiveCamera,
  });

  // Keep OrbitControls from fighting the cinematic camera while flying.
  useEffect(() => {
    if (!controls) return;
    if (props.enabled) {
      controls.enabled = false;
    } else {
      controls.enabled = true;
    }
  }, [controls, props.enabled]);

  useFrame((state, dt) => {
    const stepRef = (machine as any).__step as React.MutableRefObject<((dt: number, now: number) => void) | null>;
    stepRef?.current?.(dt, performance.now());

    // Apply camera pose
    camera.position.copy(machine.cameraPos);
    camera.lookAt(machine.cameraTarget);
  });

  if (!props.enabled) return null;

  return (
    <>
      <NavigationShip
        position={machine.shipPos}
        quaternion={machine.shipQuat}
        scale={machine.shipScale}
        thruster01={machine.shipThruster}
        energyPulse01={machine.shipEnergyPulse}
      />

      {/* Relight pulse on the target node */}
      <RelightPulseFX
        visible={machine.target.kind === 'dimmingNode' && machine.relightPulse01 > 0}
        position={machine.target.position}
        pulse01={machine.relightPulse01}
      />

      {/* Frontier growth */}
      <FrontierNebulaFX
        visible={machine.target.kind === 'frontier' && machine.frontierVisible}
        position={machine.target.position}
        progress01={machine.frontierProgress01}
      />

      <GlowingConnection
        visible={machine.target.kind === 'frontier' && machine.frontierVisible && machine.frontierProgress01 > 0.1}
        from={machine.connectionFrom}
        to={machine.connectionTo}
        intensity01={machine.frontierProgress01}
      />

      {/* UI Overlay */}
      <Html fullscreen>
        <NavigationHUD enabled={props.enabled} primary={machine.hudPrimary} secondary={machine.hudSecondary} />
        <StarcorePanel visible={machine.panelVisible} progress01={machine.panelProgress01} data={machine.starcore} />
      </Html>
    </>
  );
}
