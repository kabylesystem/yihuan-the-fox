import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Neuron } from '../../types';
import { FlightModeBranch, FlightModePhase } from './flightTypes';

const APPEAR_DURATION = 420;
const IDLE_TO_CHOOSE_DELAY = 320;

export function useFlightModeMachine(isFlightEnabled: boolean, neurons: Neuron[]) {
  const [phase, setPhase] = useState<FlightModePhase>('hidden');
  const [branch, setBranch] = useState<FlightModeBranch>(null);
  const timers = useRef<number[]>([]);

  const decayingNeuron = useMemo(
    () => neurons.filter((n) => !n.isShadow && n.strength < 0.4).sort((a, b) => a.strength - b.strength)[0] ?? null,
    [neurons]
  );

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  useEffect(() => {
    clearTimers();

    if (!isFlightEnabled) {
      setPhase('hidden');
      setBranch(null);
      return;
    }

    setPhase('appear');
    setBranch(null);

    const appearTimer = window.setTimeout(() => {
      setPhase('idle');

      const chooseTimer = window.setTimeout(() => {
        setPhase('choose');
      }, IDLE_TO_CHOOSE_DELAY);

      timers.current.push(chooseTimer);
    }, APPEAR_DURATION);

    timers.current.push(appearTimer);

    return clearTimers;
  }, [isFlightEnabled, clearTimers]);

  const chooseBranch = useCallback((nextBranch: Exclude<FlightModeBranch, null>) => {
    setBranch(nextBranch);
    setPhase(nextBranch === 'relight' ? 'relightTravel' : 'exploreTravel');
  }, []);

  const notifyTravelArrived = useCallback(() => {
    setPhase('focus');
  }, []);

  const notifyFocusComplete = useCallback(() => {
    setPhase('starcoreOpen');
  }, []);

  return {
    phase,
    branch,
    decayingNeuron,
    chooseBranch,
    notifyTravelArrived,
    notifyFocusComplete,
  };
}
