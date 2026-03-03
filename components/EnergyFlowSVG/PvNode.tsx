import React from 'react';
import { G, Rect, Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';

interface PvNodeProps {
  label: string;
  value: string;
  sunGroupRef: React.RefObject<any>;
  rayGroupRef: React.RefObject<any>;
  avg1m: string | null;
  avg5m: string | null;
  avg1mLabel: string;
  avg5mLabel: string;
  isEstimated?: boolean;
  estimatedLabel?: string;
}

export default function PvNode({ label, value, sunGroupRef, rayGroupRef, avg1m, avg5m, avg1mLabel, avg5mLabel, isEstimated, estimatedLabel }: PvNodeProps) {
  return (
    <G transform="translate(240, 420)">
      <Rect
        x={2} y={2} width={106} height={76} rx={8}
        fill="#ffffff" stroke="#94a3b8" strokeWidth={2}
      />
      <SvgText x={12} y={18} fill="#475569" fontSize={12} fontWeight="600">
        {label}
        {isEstimated && (
          <SvgText fill="#f59e0b" fontSize={9} fontWeight="400" fontStyle="italic">
            {` ${estimatedLabel || 'est.'}`}
          </SvgText>
        )}
      </SvgText>
      <G transform="translate(82, 2) scale(0.55)">
        <G ref={sunGroupRef} opacity={0}>
          <G>
            <G ref={rayGroupRef} opacity={0.3} stroke="#f59e0b" strokeWidth={1.5} strokeLinecap="round">
              <Line x1={22} y1={2} x2={22} y2={0} />
              <Line x1={22} y1={14} x2={22} y2={16} />
              <Line x1={16} y1={8} x2={14} y2={8} />
              <Line x1={28} y1={8} x2={30} y2={8} />
              <Line x1={17.7} y1={3.7} x2={16.3} y2={2.3} />
              <Line x1={26.3} y1={12.3} x2={27.7} y2={13.7} />
              <Line x1={17.7} y1={12.3} x2={16.3} y2={13.7} />
              <Line x1={26.3} y1={3.7} x2={27.7} y2={2.3} />
            </G>
            <Circle cx={22} cy={8} r={4} fill="#fbbf24" />
          </G>
          <G stroke="#fbbf24" strokeWidth={1} strokeLinecap="round" opacity={0.6}>
            <Line x1={18} y1={12} x2={10} y2={20} />
            <Line x1={24} y1={15} x2={16} y2={23} />
          </G>
        </G>
        <G transform="translate(0, 14)">
          <Line x1={6} y1={16} x2={6} y2={20} stroke="#64748b" strokeWidth={2} strokeLinecap="round" />
          <Line x1={14} y1={16} x2={14} y2={20} stroke="#64748b" strokeWidth={2} strokeLinecap="round" />
          <Line x1={22} y1={16} x2={22} y2={20} stroke="#64748b" strokeWidth={2} strokeLinecap="round" />
          <Polygon points="2,16 28,16 24,6 4,6" fill="#334155" />
          <Polygon
            points="2,15 28,15 24,5 4,5"
            fill="#1e293b" stroke="#475569" strokeWidth={1} strokeLinejoin="round"
          />
          <Line x1={3} y1={10} x2={26} y2={10} stroke="#3b82f6" strokeWidth={0.5} opacity={0.6} />
          <Line x1={3.5} y1={12.5} x2={27} y2={12.5} stroke="#3b82f6" strokeWidth={0.5} opacity={0.6} />
          <Line x1={2.5} y1={7.5} x2={25} y2={7.5} stroke="#3b82f6" strokeWidth={0.5} opacity={0.6} />
          <Line x1={10} y1={15} x2={11.5} y2={5} stroke="#3b82f6" strokeWidth={0.5} opacity={0.6} />
          <Line x1={15} y1={15} x2={15} y2={5} stroke="#3b82f6" strokeWidth={0.5} opacity={0.6} />
          <Line x1={20} y1={15} x2={18.5} y2={5} stroke="#3b82f6" strokeWidth={0.5} opacity={0.6} />
          <Polygon points="4,15 15,15 13,5 4,5" fill="#ffffff" opacity={0.1} />
        </G>
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
