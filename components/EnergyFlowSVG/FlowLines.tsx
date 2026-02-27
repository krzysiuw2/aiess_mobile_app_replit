import React from 'react';
import { G, Path } from 'react-native-svg';

export const FLOW_PATHS = {
  batt: 'M 50 150 L 50 250 Q 50 270 70 270 L 155 270 Q 175 270 175 290 L 175 320',
  load: 'M 175 376 L 175 420',
  grid: 'M 155 350 L 60 350 Q 40 350 40 370 L 40 420',
  pv:   'M 195 350 L 286 350 Q 306 350 306 370 L 306 420',
};

interface FlowLinesProps {
  battRef: React.RefObject<any>;
  loadRef: React.RefObject<any>;
  gridRef: React.RefObject<any>;
  pvRef: React.RefObject<any>;
}

function BaseWires() {
  return (
    <G>
      <Path d={FLOW_PATHS.batt} fill="none" stroke="#cbd5e1" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={FLOW_PATHS.load} fill="none" stroke="#cbd5e1" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={FLOW_PATHS.grid} fill="none" stroke="#cbd5e1" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={FLOW_PATHS.pv}   fill="none" stroke="#cbd5e1" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </G>
  );
}

export default function FlowLines({ battRef, loadRef, gridRef, pvRef }: FlowLinesProps) {
  return (
    <G>
      <BaseWires />
      <Path ref={battRef} d={FLOW_PATHS.batt} fill="none" stroke="#3b82f6" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 16" strokeDashoffset={0} opacity={0} />
      <Path ref={loadRef} d={FLOW_PATHS.load} fill="none" stroke="#3b82f6" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 16" strokeDashoffset={0} opacity={0} />
      <Path ref={gridRef} d={FLOW_PATHS.grid} fill="none" stroke="#3b82f6" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 16" strokeDashoffset={0} opacity={0} />
      <Path ref={pvRef}   d={FLOW_PATHS.pv}   fill="none" stroke="#3b82f6" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 16" strokeDashoffset={0} opacity={0} />
    </G>
  );
}
