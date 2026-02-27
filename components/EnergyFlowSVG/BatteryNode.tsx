import React, { useEffect, useRef } from 'react';
import { G, Rect, Path, ClipPath, Defs, Line } from 'react-native-svg';

const WAVY_PATH =
  'M -120 0 Q -105 -10 -90 0 T -60 0 Q -45 -10 -30 0 T 0 0 Q 15 -10 30 0 T 60 0 Q 75 -10 90 0 T 120 0 Q 135 -10 150 0 T 180 0 Q 195 -10 210 0 T 240 0 V 150 H -120 Z';
const FLAT_PATH =
  'M -120 0 Q -105 0 -90 0 T -60 0 Q -45 0 -30 0 T 0 0 Q 15 0 30 0 T 60 0 Q 75 0 90 0 T 120 0 Q 135 0 150 0 T 180 0 Q 195 0 210 0 T 240 0 V 150 H -120 Z';

interface BatteryNodeProps {
  batterySoc: number;
  batteryPower: number;
  battColor: string;
  waveActive: boolean;
  waveDir: 1 | -1;
}

export default function BatteryNode({
  batterySoc, batteryPower, battColor, waveActive, waveDir,
}: BatteryNodeProps) {
  const waveGroupRef = useRef<any>(null);
  const liquidPathRef = useRef<any>(null);
  const stateRef = useRef({
    targetY: 130 - (batterySoc / 100) * 100,
    y: 130 - (batterySoc / 100) * 100,
    x: 0,
    speed: waveActive ? 60 : 0,
    dir: waveDir,
  });

  useEffect(() => {
    const s = stateRef.current;
    s.targetY = 130 - (batterySoc / 100) * 100;
    s.speed = Math.abs(batteryPower) > 0.2 ? 60 : 0;
    s.dir = batteryPower < 0 ? -1 : 1;
  }, [batterySoc, batteryPower]);

  useEffect(() => {
    if (liquidPathRef.current) {
      liquidPathRef.current.setNativeProps({
        d: waveActive ? WAVY_PATH : FLAT_PATH,
      });
    }
  }, [waveActive]);

  useEffect(() => {
    let running = true;
    let lastTime = performance.now();

    const loop = (time: number) => {
      if (!running) return;
      const dt = Math.min(time - lastTime, 100);
      lastTime = time;
      const s = stateRef.current;

      s.y += (s.targetY - s.y) * 0.1;

      if (s.speed > 0) {
        s.x += s.speed * s.dir * (dt / 1000);
        if (s.x > 0) s.x -= 120;
        if (s.x <= -120) s.x += 120;
      }

      waveGroupRef.current?.setNativeProps({
        matrix: [1, 0, 0, 1, s.x, s.y],
      });

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
    return () => { running = false; };
  }, []);

  return (
    <G transform="translate(0, 0)">
      <Defs>
        <ClipPath id="liquid-clip">
          <Rect x={20} y={30} width={60} height={100} rx={4} />
        </ClipPath>
      </Defs>

      {/* Battery casing */}
      <Rect x={16} y={26} width={68} height={108} rx={8} fill="#0f172a" />
      <Rect x={36} y={16} width={28} height={10} rx={3} fill="#0f172a" />
      <Rect x={20} y={30} width={60} height={100} rx={4} fill="#1e293b" />

      {/* Scale lines: 75%, 50%, 25% */}
      <G stroke="#ffffff" strokeWidth={2} strokeLinecap="round" opacity={0.3}>
        <Line x1={72} y1={55} x2={80} y2={55} />
        <Line x1={68} y1={80} x2={80} y2={80} />
        <Line x1={72} y1={105} x2={80} y2={105} />
      </G>

      {/* Animated liquid fill */}
      <G clipPath="url(#liquid-clip)">
        <G ref={waveGroupRef}>
          <Path
            ref={liquidPathRef}
            fill={battColor}
            d={waveActive ? WAVY_PATH : FLAT_PATH}
          />
        </G>
      </G>

      {/* Glass highlights */}
      <Rect
        x={20} y={30} width={60} height={100} rx={4}
        fill="none" stroke="#334155" strokeWidth={2}
      />
      <Rect x={22} y={32} width={10} height={96} rx={2} fill="#ffffff" opacity={0.1} />
    </G>
  );
}
