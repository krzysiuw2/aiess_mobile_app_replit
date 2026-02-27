import React from 'react';
import { G, Rect, Path, Line, Text as SvgText } from 'react-native-svg';

interface AiDecisionNodeProps {
  headerLabel: string;
  col1Label: string;
  col2Label: string;
  col3Label: string;
  ruleId: string;
  actionText: string;
  powerText: string;
  aiColor: string;
  powerColor: string;
}

export default function AiDecisionNode({
  headerLabel, col1Label, col2Label, col3Label,
  ruleId, actionText, powerText, aiColor, powerColor,
}: AiDecisionNodeProps) {
  let displayRuleId = ruleId;
  let idFontSize = 11;

  if (ruleId.length > 15) {
    displayRuleId = ruleId.substring(0, 13) + '\u2026';
    idFontSize = 8;
  } else if (ruleId.length > 12) {
    idFontSize = 8;
  } else if (ruleId.length > 8) {
    idFontSize = 9.5;
  }

  return (
    <G transform="translate(100, 145)">
      <Rect
        x={2} y={2} width={236} height={60} rx={8}
        fill="#ffffff" stroke="#e2e8f0" strokeWidth={2}
      />
      <Path
        d="M 4 10 Q 4 4 10 4 L 230 4 Q 236 4 236 10 L 236 20 L 4 20 Z"
        fill="#f8fafc"
      />
      <Line x1={2} y1={20} x2={238} y2={20} stroke="#e2e8f0" strokeWidth={1} />
      <SvgText
        x={12} y={15} fill="#334155"
        fontSize={10} fontWeight="bold" letterSpacing={0.5}
      >
        {headerLabel}
      </SvgText>

      <Line x1={90} y1={28} x2={90} y2={52} stroke="#f1f5f9" strokeWidth={2} />
      <Line x1={160} y1={28} x2={160} y2={52} stroke="#f1f5f9" strokeWidth={2} />

      {/* Column 1: Rule ID */}
      <SvgText x={12} y={34} fill="#64748b" fontSize={9} fontWeight="600">
        {col1Label}
      </SvgText>
      <SvgText
        x={12} y={48} fill={aiColor}
        fontSize={idFontSize} fontWeight="bold"
      >
        {displayRuleId}
      </SvgText>

      {/* Column 2: Action */}
      <SvgText
        x={125} y={34} fill="#64748b"
        fontSize={9} fontWeight="600" textAnchor="middle"
      >
        {col2Label}
      </SvgText>
      <SvgText
        x={125} y={48} fill={aiColor}
        fontSize={11} fontWeight="bold" textAnchor="middle"
      >
        {actionText}
      </SvgText>

      {/* Column 3: Target Power */}
      <SvgText x={170} y={34} fill="#64748b" fontSize={9} fontWeight="600">
        {col3Label}
      </SvgText>
      <SvgText x={170} y={48} fill={powerColor} fontSize={12} fontWeight="bold">
        {powerText}
      </SvgText>
    </G>
  );
}
