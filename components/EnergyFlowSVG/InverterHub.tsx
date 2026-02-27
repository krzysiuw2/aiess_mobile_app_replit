import React from 'react';
import { G, Rect, Path, Circle } from 'react-native-svg';

export default function InverterHub() {
  return (
    <G transform="translate(155, 320)">
      <Rect x={0} y={0} width={40} height={56} rx={8} fill="#0f172a" />
      <Path
        d="M 0 16 Q 20 22 40 16"
        fill="none"
        stroke="#334155"
        strokeWidth={2}
      />
      <Rect x={12} y={24} width={16} height={6} rx={2} fill="#cbd5e1" />
      <Circle cx={11} cy={43} r={3} fill="#10b981" />
    </G>
  );
}
