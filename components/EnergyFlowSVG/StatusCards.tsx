import React from 'react';
import { G, Rect, Circle, Path, Text as SvgText } from 'react-native-svg';
import type { BattStatus } from './types';

interface StatusCardsProps {
  socLabel: string;
  socValue: string;
  statusLabel: string;
  statusText: string;
  statusColor: string;
  battStatus: BattStatus;
  powerLabel: string;
  powerValue: string;
  statusIconRef: React.RefObject<any>;
}

function SocCard({ label, value }: { label: string; value: string }) {
  return (
    <G transform="translate(100, 20)">
      <Rect
        x={2} y={2} width={106} height={50} rx={8}
        fill="#ffffff" stroke="#94a3b8" strokeWidth={2}
      />
      <SvgText
        x={55} y={22} fill="#475569"
        fontSize={12} fontWeight="600" textAnchor="middle"
      >
        {label}
      </SvgText>
      <SvgText
        x={55} y={42} fill="#10b981"
        fontSize={18} fontWeight="bold" textAnchor="middle"
      >
        {value}
      </SvgText>
    </G>
  );
}

function StatusCard({
  label, text, color, battStatus, iconRef,
}: {
  label: string; text: string; color: string;
  battStatus: BattStatus;
  iconRef: React.RefObject<any>;
}) {
  const outerDash = battStatus === 'discharging' ? '15 6' : undefined;

  return (
    <G transform="translate(220, 20)">
      <Rect
        x={2} y={2} width={116} height={50} rx={8}
        fill="#ffffff" stroke="#94a3b8" strokeWidth={2}
      />
      <G transform="translate(20, 27)">
        <G>
          <Circle
            ref={iconRef}
            cx={0} cy={0} r={10}
            fill="none" stroke={color} strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={outerDash}
            opacity={1}
          />
          <Circle cx={0} cy={0} r={4} fill={color} />
        </G>
      </G>
      <SvgText
        x={75} y={22} fill="#475569"
        fontSize={12} fontWeight="600" textAnchor="middle"
      >
        {label}
      </SvgText>
      <SvgText
        x={75} y={42} fill={color}
        fontSize={14} fontWeight="bold" textAnchor="middle"
      >
        {text}
      </SvgText>
    </G>
  );
}

function PowerCard({ label, value }: { label: string; value: string }) {
  return (
    <G transform="translate(220, 80)">
      <Rect
        x={2} y={2} width={116} height={50} rx={8}
        fill="#ffffff" stroke="#94a3b8" strokeWidth={2}
      />
      <Path
        d="M 25 15 L 15 30 L 22 30 L 18 40 L 30 25 L 23 25 Z"
        fill="none" stroke="#475569" strokeWidth={2} strokeLinejoin="round"
      />
      <SvgText
        x={75} y={22} fill="#475569"
        fontSize={12} fontWeight="600" textAnchor="middle"
      >
        {label}
      </SvgText>
      <SvgText
        x={75} y={42} fill="#1e293b"
        fontSize={16} fontWeight="bold" textAnchor="middle"
      >
        {value}
      </SvgText>
    </G>
  );
}

export default function StatusCards({
  socLabel, socValue,
  statusLabel, statusText, statusColor, battStatus,
  powerLabel, powerValue,
  statusIconRef,
}: StatusCardsProps) {
  return (
    <G>
      <SocCard label={socLabel} value={socValue} />
      <StatusCard
        label={statusLabel} text={statusText} color={statusColor}
        battStatus={battStatus} iconRef={statusIconRef}
      />
      <PowerCard label={powerLabel} value={powerValue} />
    </G>
  );
}
