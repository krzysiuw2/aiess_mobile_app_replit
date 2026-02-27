import React from 'react';
import { G, Rect, Path, Circle, Text as SvgText } from 'react-native-svg';

interface LoadNodeProps {
  label: string;
  value: string;
  smoke1Ref: React.RefObject<any>;
  smoke2Ref: React.RefObject<any>;
  smoke3Ref: React.RefObject<any>;
  avg1m: string | null;
  avg5m: string | null;
}

export default function LoadNode({
  label, value,
  smoke1Ref, smoke2Ref, smoke3Ref,
  avg1m, avg5m,
}: LoadNodeProps) {
  return (
    <G transform="translate(122, 420)">
      <Rect
        x={2} y={2} width={106} height={76} rx={8}
        fill="#ffffff" stroke="#94a3b8" strokeWidth={2}
      />
      <SvgText x={12} y={18} fill="#475569" fontSize={12} fontWeight="600">
        {label}
      </SvgText>
      <G transform="translate(80, 4) scale(0.55)">
        <G fill="#cbd5e1">
          <Circle ref={smoke1Ref} cx={21} cy={4} r={2.5} opacity={0} />
          <Circle ref={smoke2Ref} cx={21} cy={4} r={2.5} opacity={0} />
          <Circle ref={smoke3Ref} cx={21} cy={4} r={2.5} opacity={0} />
        </G>
        <Path
          d="M 2 34 L 2 18 L 10 24 L 10 14 L 18 20 L 18 14 L 26 14 L 26 34 Z"
          fill="#64748b" stroke="#334155" strokeWidth={1.5} strokeLinejoin="round"
        />
        <Path
          d="M 2 18 L 10 24 M 10 14 L 18 20 M 18 14 L 26 14"
          stroke="#f8fafc" strokeWidth={1} strokeLinecap="round" opacity={0.4}
        />
        <Rect x={19} y={10} width={4} height={4} fill="#94a3b8" />
        <Rect x={18} y={8} width={6} height={2} rx={0.5} fill="#334155" />
        <Rect x={6} y={26} width={3} height={4} rx={0.5} fill="#fbbf24" opacity={0.9} />
        <Rect x={12} y={26} width={3} height={4} rx={0.5} fill="#fbbf24" opacity={0.9} />
        <Rect x={18} y={26} width={3} height={4} rx={0.5} fill="#fbbf24" opacity={0.9} />
        <Rect x={12} y={20} width={3} height={4} rx={0.5} fill="#fbbf24" opacity={0.9} />
        <Rect x={18} y={20} width={3} height={4} rx={0.5} fill="#fbbf24" opacity={0.9} />
      </G>
      <SvgText x={12} y={38} fill="#1e293b" fontSize={18} fontWeight="bold">
        {value}
      </SvgText>
      <SvgText x={12} y={54} fill="#94a3b8" fontSize={9}>
        {avg1m ? `${avg1m} (1 min)` : '— (1 min)'}
      </SvgText>
      <SvgText x={12} y={66} fill="#94a3b8" fontSize={9}>
        {avg5m ? `${avg5m} (5 min)` : '— (5 min)'}
      </SvgText>
    </G>
  );
}
