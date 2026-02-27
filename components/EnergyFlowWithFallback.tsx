import React from 'react';
import EnergyFlowSVG from './EnergyFlowSVG';
import type { EnergyFlowProps } from './EnergyFlowSVG/types';

export default function EnergyFlowWithFallback(props: EnergyFlowProps) {
  return <EnergyFlowSVG {...props} />;
}
