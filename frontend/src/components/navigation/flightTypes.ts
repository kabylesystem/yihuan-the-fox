export type FlightModePhase =
  | 'hidden'
  | 'appear'
  | 'idle'
  | 'choose'
  | 'relightTravel'
  | 'exploreTravel'
  | 'focus'
  | 'starcoreOpen';

export type FlightModeBranch = 'relight' | 'explore' | null;
