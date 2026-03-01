import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Neuron } from '../../types';
import { FlightModeBranch, FlightModePhase } from './flightTypes';
import { FlightShip } from './FlightShip';
import { FrontierNebula } from './FrontierNebula';

interface FlightCameraRigProps {
  phase: FlightModePhase;
  branch: FlightModeBranch;
  nodes: Neuron[];
  searchTarget: Neuron | null;
  relightTargetId?: string | null;
  onTravelArrive: () => void;
  onFocusComplete: () => void;
}

const CAMERA_DEFAULT = new THREE.Vector3(0, 0, 20);
const CAMERA_DEFAULT_LOOK = new THREE.Vector3(0, 0, 0);
const CAMERA_WIDE = new THREE.Vector3(0, 0.1, 17.2);
const CAMERA_WIDE_LOOK = new THREE.Vector3(0, -0.3, 0);
const SHIP_IDLE_POS = new THREE.Vector3(0, -3.9, 8.2);

function getWeakestNode(nodes: Neuron[]): Neuron | null {
  return nodes.filter((n) => !n.isShadow).sort((a, b) => a.strength - b.strength)[0] ?? null;
}

function getFrontierTarget(nodes: Neuron[]): THREE.Vector3 {
  if (nodes.length === 0) return new THREE.Vector3(6, 2.5, -1);

  const maxX = Math.max(...nodes.map((n) => n.x ?? 0));
  const avgY = nodes.reduce((acc, n) => acc + (n.y ?? 0), 0) / nodes.length;
  const avgZ = nodes.reduce((acc, n) => acc + (n.z ?? 0), 0) / nodes.length;

  return new THREE.Vector3(maxX + 3.8, avgY + 1.6, avgZ - 0.8);
}

function sampleBezier(start: THREE.Vector3, end: THREE.Vector3, t: number) {
  const control1 = start.clone().add(new THREE.Vector3(0.6, 1.2, -3));
  const control2 = end.clone().add(new THREE.Vector3(-0.7, 0.9, 1.4));
  return new THREE.CubicBezierCurve3(start, control1, control2, end).getPoint(t);
}

function getNodePosition(nodes: Neuron[], nodeId?: string | null): THREE.Vector3 | null {
  if (!nodeId) return null;
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  return new THREE.Vector3(node.x ?? 0, node.y ?? 0, node.z ?? 0);
}

function getRelightDockPoint(target: THREE.Vector3): THREE.Vector3 {
  const lateral = target.clone();
  lateral.z = 0;

  if (lateral.lengthSq() < 0.0001) {
    lateral.set(1, 0, 0);
  } else {
    lateral.normalize();
  }

  return target
    .clone()
    .add(lateral.multiplyScalar(1.2))
    .add(new THREE.Vector3(0, 0.5, 2.1));
}

export function FlightCameraRig({
  phase,
  branch,
  nodes,
  searchTarget,
  relightTargetId,
  onTravelArrive,
  onFocusComplete,
}: FlightCameraRigProps) {
  const { camera, controls } = useThree() as {
    camera: THREE.PerspectiveCamera;
    controls?: {
      target: THREE.Vector3;
      update: () => void;
    };
  };

  const shipPos = useRef(SHIP_IDLE_POS.clone());
  const shipLook = useRef(new THREE.Vector3(0, -3.9, 2.5));
  const appearProgress = useRef(0);
  const thrust = useRef(0);

  const phaseRef = useRef<FlightModePhase>('hidden');
  const travelProgress = useRef(0);
  const focusProgress = useRef(0);
  const hasArrived = useRef(false);
  const hasFocused = useRef(false);
  const travelTarget = useRef<THREE.Vector3>(new THREE.Vector3());

  const weakestNode = useMemo(() => getWeakestNode(nodes), [nodes]);
  const weakestNodePos = useMemo(
    () =>
      weakestNode
        ? new THREE.Vector3(weakestNode.x ?? 0, weakestNode.y ?? 0, weakestNode.z ?? 0)
        : new THREE.Vector3(0, 0, 0),
    [weakestNode]
  );
  const relightNodePos = useMemo(
    () => getNodePosition(nodes, relightTargetId) ?? weakestNodePos.clone(),
    [nodes, relightTargetId, weakestNodePos]
  );
  const relightDockPos = useMemo(() => getRelightDockPoint(relightNodePos), [relightNodePos]);

  const frontierTarget = useMemo(() => getFrontierTarget(nodes), [nodes]);

  const nebulaLinks = useMemo(() => {
    const links = nodes
      .filter((n) => !n.isShadow)
      .slice(0, 3)
      .map((n) => new THREE.Vector3(n.x ?? 0, n.y ?? 0, n.z ?? 0));

    return links;
  }, [nodes]);

  useEffect(() => {
    if (phaseRef.current === phase) return;
    phaseRef.current = phase;

    if (phase === 'relightTravel' || phase === 'exploreTravel') {
      travelProgress.current = 0;
      hasArrived.current = false;
      hasFocused.current = false;
      travelTarget.current = phase === 'relightTravel' ? relightDockPos.clone() : frontierTarget.clone();
    }

    if (phase === 'focus') {
      focusProgress.current = 0;
      hasFocused.current = false;
    }

    if (phase === 'starcoreOpen' && branch === 'relight') {
      camera.position.copy(CAMERA_WIDE);
      controls?.target.copy(CAMERA_WIDE_LOOK);
      controls?.update();
    }

    if (phase === 'hidden') {
      appearProgress.current = 0;
      thrust.current = 0;
      hasArrived.current = false;
      hasFocused.current = false;
      shipPos.current.copy(SHIP_IDLE_POS);
      shipLook.current.set(0, -3.9, 2.5);
    }
  }, [phase, branch, camera, controls, relightDockPos, frontierTarget]);

  useFrame((_, delta) => {
    const isFlightActive = phase !== 'hidden';

    if (!isFlightActive) {
      // Only move the camera when searching — otherwise let the user navigate freely
      if (searchTarget && searchTarget.x !== undefined) {
        camera.position.lerp(new THREE.Vector3(searchTarget.x, searchTarget.y, (searchTarget.z ?? 0) + 5), 0.05);
        if (controls) controls.target.lerp(new THREE.Vector3(searchTarget.x, searchTarget.y, searchTarget.z), 0.06);
        controls?.update();
      }
      return;
    }

    if (phase === 'appear') {
      appearProgress.current = Math.min(1, appearProgress.current + delta / 0.45);
      thrust.current = Math.max(0.15, 0.25 * (1 - appearProgress.current));
      shipPos.current.lerp(SHIP_IDLE_POS, 0.14);
      shipLook.current.set(0, -4.6, 2.4);
      camera.position.lerp(new THREE.Vector3(0, -0.1, 18), 0.06);
      controls?.target.lerp(new THREE.Vector3(0, -0.4, 0), 0.07);
    } else if (phase === 'idle' || phase === 'choose' || (phase === 'starcoreOpen' && branch !== 'relight')) {
      appearProgress.current = 1;
      thrust.current = 0.15;
      shipPos.current.lerp(SHIP_IDLE_POS, 0.08);
      shipLook.current.set(0, -4.6, 2.4);
      camera.position.lerp(CAMERA_WIDE, 0.05);
      controls?.target.lerp(CAMERA_WIDE_LOOK, 0.05);
    } else if (phase === 'relightTravel') {
      const start = SHIP_IDLE_POS;
      const end = travelTarget.current;
      travelProgress.current = Math.min(1, travelProgress.current + delta / 1.0);
      const t = travelProgress.current;

      const pos = sampleBezier(start, end, t);
      shipPos.current.copy(pos);
      shipLook.current.lerp(relightNodePos.clone(), 0.16);
      thrust.current = 0.82;
      appearProgress.current = 1;

      // Keep the same wide-angle framing during relight approach.
      camera.position.lerp(CAMERA_WIDE, 0.08);
      controls?.target.lerp(CAMERA_WIDE_LOOK, 0.09);

      if (t >= 1 && !hasArrived.current) {
        hasArrived.current = true;
        thrust.current = 0.28;
        onTravelArrive();
      }
    } else if (phase === 'exploreTravel') {
      const start = SHIP_IDLE_POS;
      const end = travelTarget.current;
      travelProgress.current = Math.min(1, travelProgress.current + delta / 1.0);
      const t = travelProgress.current;

      const pos = sampleBezier(start, end, t);
      const next = sampleBezier(start, end, Math.min(1, t + 0.02));
      shipPos.current.copy(pos);
      shipLook.current.copy(next);
      thrust.current = 0.9;
      appearProgress.current = 1;

      const camGoal = pos.clone().add(new THREE.Vector3(0.9, 1.2, 6.4));
      camera.position.lerp(camGoal, 0.11);
      controls?.target.lerp(pos.clone().add(new THREE.Vector3(0, 0.1, -0.2)), 0.14);

      if (t >= 1 && !hasArrived.current) {
        hasArrived.current = true;
        thrust.current = 0.35;
        onTravelArrive();
      }
    } else if (phase === 'focus') {
      if (branch === 'relight') {
        thrust.current = 0.18;
        shipPos.current.lerp(relightDockPos, 0.1);
        shipLook.current.lerp(relightNodePos.clone(), 0.14);

        focusProgress.current = Math.min(1, focusProgress.current + delta / 0.45);
        camera.position.lerp(CAMERA_WIDE, 0.08);
        controls?.target.lerp(CAMERA_WIDE_LOOK, 0.1);

        if (focusProgress.current >= 1 && !hasFocused.current) {
          hasFocused.current = true;
          onFocusComplete();
        }
      } else {
        thrust.current = 0.2;
        const focusPoint = (branch === 'explore' ? frontierTarget : weakestNodePos).clone();
        shipPos.current.lerp(focusPoint, 0.08);
        shipLook.current.lerp(focusPoint.clone().add(new THREE.Vector3(0, 0, -0.6)), 0.12);

        focusProgress.current = Math.min(1, focusProgress.current + delta / 0.5);
        const cameraOffset = new THREE.Vector3(0.5, 0.75, 3.8).multiplyScalar(1 - focusProgress.current * 0.2);
        camera.position.lerp(focusPoint.clone().add(cameraOffset), 0.14);
        controls?.target.lerp(focusPoint, 0.16);

        if (focusProgress.current >= 1 && !hasFocused.current) {
          hasFocused.current = true;
          onFocusComplete();
        }
      }
    } else if (phase === 'starcoreOpen' && branch === 'relight') {
      thrust.current = 0.14;
      shipPos.current.lerp(relightDockPos, 0.08);
      shipLook.current.lerp(relightNodePos.clone(), 0.12);
    }

    controls?.update();
  });

  const frontierCenter = frontierTarget;
  const shouldShowFrontierNebula = (phase === 'focus' || phase === 'starcoreOpen') && branch === 'explore';

  return (
    <>
      <FlightShip
        position={shipPos.current}
        lookAt={shipLook.current}
        phase={phase}
        appearProgress={appearProgress.current}
        thrust={thrust.current}
      />

      <FrontierNebula center={frontierCenter} linkedTargets={nebulaLinks} active={shouldShowFrontierNebula} />
    </>
  );
}
