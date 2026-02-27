import React from 'react';
import { G, Rect, Path, Text as SvgText } from 'react-native-svg';

interface GridNodeProps {
  label: string;
  value: string;
  arrowPath: string;
  arrowColor: string;
  avg1m: string | null;
  avg5m: string | null;
  avg1mLabel: string;
  avg5mLabel: string;
}

export default function GridNode({ label, value, arrowPath, arrowColor, avg1m, avg5m, avg1mLabel, avg5mLabel }: GridNodeProps) {
  return (
    <G transform="translate(0, 420)">
      <Rect
        x={2} y={2} width={106} height={76} rx={8}
        fill="#ffffff" stroke="#94a3b8" strokeWidth={2}
      />
      <SvgText x={12} y={18} fill="#475569" fontSize={12} fontWeight="600">
        {label}
      </SvgText>
      <G transform="translate(82, 6) scale(0.6)">
        <Path
          d="M 12 26 L 18 6 L 24 26 M 10 14 L 26 14 M 14 20 L 22 20 M 15 8 L 21 8"
          fill="none" stroke="#475569" strokeWidth={1.5}
          strokeLinecap="round" strokeLinejoin="round"
        />
        <Path
          d={arrowPath}
          fill="none" stroke={arrowColor} strokeWidth={1.5}
          strokeLinecap="round" strokeLinejoin="round"
        />
      </G>
      <SvgText x={12} y={38} fill="#1e293b" fontSize={18} fontWeight="bold">
        {value}
      </SvgText>
      <SvgText x={12} y={54} fill="#94a3b8" fontSize={9}>
        {avg1m ? `${avg1m} (${avg1mLabel})` : `— (${avg1mLabel})`}
      </SvgText>
      <SvgText x={12} y={66} fill="#94a3b8" fontSize={9}>
        {avg5m ? `${avg5m} (${avg5mLabel})` : `— (${avg5mLabel})`}
      </SvgText>
    </G>
  );
}
