import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg from 'react-native-svg';
import type { EnergyFlowProps, DerivedState, FlowState } from './types';

import FlowLines from './FlowLines';
import BatteryNode from './BatteryNode';
import StatusCards from './StatusCards';
import AiDecisionNode from './AiDecisionNode';
import InverterHub from './InverterHub';
import GridNode from './GridNode';
import LoadNode from './LoadNode';
import PvNode from './PvNode';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ASPECT_RATIO = 350 / 550;
const DIAGRAM_WIDTH = SCREEN_WIDTH - 32;
const DIAGRAM_HEIGHT = DIAGRAM_WIDTH / ASPECT_RATIO;

const AI_COLOR_MAP: Record<string, string> = {
  ch: '#3b82f6',
  sb: '#64748b',
  dis: '#f59e0b',
};

const formatValue = (v: number): string =>
  Math.abs(v) < 100 ? v.toFixed(1) : Math.round(v).toString();

function deriveState(props: EnergyFlowProps): DerivedState {
  const { liveData, t } = props;
  const batteryPower = liveData?.batteryPower ?? 0;
  const batterySoc = liveData?.batterySoc ?? 0;
  const gridPower = liveData?.gridPower ?? 0;
  const pvPower = liveData?.pvPower ?? 0;
  const loadPower = liveData?.factoryLoad ?? Math.max(0, gridPower + batteryPower + pvPower);

  const battFlowState: FlowState =
    batteryPower < -0.2 ? 'reverse' : batteryPower > 0.2 ? 'forward' : 'standby';
  const gridFlowState: FlowState =
    gridPower < -0.1 ? 'forward' : gridPower > 0.1 ? 'reverse' : 'standby';
  const loadFlowState: FlowState = loadPower > 0.2 ? 'forward' : 'standby';
  const pvFlowState: FlowState = pvPower > 0.1 ? 'reverse' : 'standby';

  const battColor =
    batterySoc <= 20 ? '#ef4444' : batterySoc <= 50 ? '#f59e0b' : '#10b981';

  const battStatus =
    batteryPower < -0.5 ? ('charging' as const)
    : batteryPower > 0.5 ? ('discharging' as const)
    : ('standby' as const);

  const statusColorMap = { charging: '#3b82f6', discharging: '#f59e0b', standby: '#64748b' };
  const statusColor = statusColorMap[battStatus];
  const statusText = t.monitor[battStatus];

  const socValue = `${formatValue(batterySoc)} %`;
  const battPowerValue = `${formatValue(Math.abs(batteryPower))} kW`;
  const gridValue = `${formatValue(gridPower)} kW`;
  const loadValue = `${formatValue(loadPower)} kW`;
  const pvValue = `${formatValue(pvPower)} kW`;

  const fmtAvg = (v: number | undefined): string | null =>
    v != null ? `${formatValue(v)} kW` : null;

  const gridAvg1m = fmtAvg(liveData?.gridPowerAvg1m);
  const gridAvg5m = fmtAvg(liveData?.gridPowerAvg5m);
  const loadAvg1m = fmtAvg(liveData?.factoryLoadAvg1m);
  const loadAvg5m = fmtAvg(liveData?.factoryLoadAvg5m);
  const pvAvg1m = fmtAvg(liveData?.pvPowerAvg1m);
  const pvAvg5m = fmtAvg(liveData?.pvPowerAvg5m);

  let gridArrowPath: string;
  let gridArrowColor: string;
  if (gridPower > 0.1) {
    gridArrowPath = 'M 4 18 L 10 18 M 8 16 L 10 18 L 8 20';
    gridArrowColor = '#ef4444';
  } else if (gridPower < -0.1) {
    gridArrowPath = 'M 10 18 L 4 18 M 6 16 L 4 18 L 6 20';
    gridArrowColor = '#10b981';
  } else {
    gridArrowPath = 'M 4 18 L 10 18';
    gridArrowColor = '#475569';
  }

  const rawAction = liveData?.activeRuleAction ?? 'sb';
  const aiColor = AI_COLOR_MAP[rawAction] ?? '#64748b';
  const rawRuleId = liveData?.activeRuleId ?? 'local_default_standby';
  const aiRuleId = rawRuleId === 'local_default_standby' ? t.monitor.standby : rawRuleId;

  let aiAction: string;
  if (rawAction === 'ch') aiAction = t.monitor.charge;
  else if (rawAction === 'dis') aiAction = t.monitor.discharge;
  else aiAction = t.monitor.standby;

  const aiPowerRaw = liveData?.activeRulePower;
  const aiPower = aiPowerRaw != null ? `${formatValue(aiPowerRaw)} kW` : '—';
  const aiPowerColor = rawAction === 'sb' ? '#64748b' : '#1e293b';

  return {
    batteryPower, batterySoc, gridPower, pvPower, loadPower,
    battFlowState, gridFlowState, loadFlowState, pvFlowState,
    battColor, battStatus, statusColor, statusText,
    socValue, battPowerValue, gridValue, loadValue, pvValue,
    gridArrowPath, gridArrowColor,
    gridAvg1m, gridAvg5m, loadAvg1m, loadAvg5m, pvAvg1m, pvAvg5m,
    sunActive: pvPower >= 0.1,
    smokeActive: loadPower > 0.2,
    waveActive: Math.abs(batteryPower) > 0.2,
    waveDir: batteryPower < 0 ? -1 : 1,
    aiRuleId, aiAction, aiPower, aiColor, aiPowerColor,
  };
}

interface FlowLineAnim {
  offset: number;
  opacity: number;
  dir: 1 | -1 | 0; // +1 forward, -1 reverse, 0 standby
}

interface SmokePuff {
  phase: number; // 0..2500
  active: boolean;
}

interface AnimState {
  time: number;
  flowBatt: FlowLineAnim;
  flowGrid: FlowLineAnim;
  flowLoad: FlowLineAnim;
  flowPv: FlowLineAnim;
  statusPulseActive: boolean;
  statusPulsePhase: number;
  sunOpacity: number;
  sunTargetOpacity: number;
  rayPhase: number;
  rayActive: boolean;
  smoke: [SmokePuff, SmokePuff, SmokePuff];
  smokeActive: boolean;
}

function flowDirFromState(s: FlowState): 1 | -1 | 0 {
  if (s === 'forward') return 1;
  if (s === 'reverse') return -1;
  return 0;
}

export default function EnergyFlowSVG(props: EnergyFlowProps) {
  const d = useMemo(() => deriveState(props), [props.liveData, props.t]);

  // Refs for animated SVG elements
  const battLineRef = useRef<any>(null);
  const loadLineRef = useRef<any>(null);
  const gridLineRef = useRef<any>(null);
  const pvLineRef = useRef<any>(null);
  const statusIconRef = useRef<any>(null);
  const sunGroupRef = useRef<any>(null);
  const rayGroupRef = useRef<any>(null);
  const smoke1Ref = useRef<any>(null);
  const smoke2Ref = useRef<any>(null);
  const smoke3Ref = useRef<any>(null);

  // Mutable animation state (not React state -- mutated in rAF)
  const animRef = useRef<AnimState>({
    time: 0,
    flowBatt: { offset: 0, opacity: 0, dir: 0 },
    flowGrid: { offset: 0, opacity: 0, dir: 0 },
    flowLoad: { offset: 0, opacity: 0, dir: 0 },
    flowPv: { offset: 0, opacity: 0, dir: 0 },
    statusPulseActive: false,
    statusPulsePhase: 0,
    sunOpacity: 0,
    sunTargetOpacity: 0,
    rayPhase: 0,
    rayActive: false,
    smoke: [
      { phase: 0, active: false },
      { phase: 800, active: false },
      { phase: 1600, active: false },
    ],
    smokeActive: false,
  });

  // Sync derived state into animation state when data changes
  useEffect(() => {
    const a = animRef.current;
    a.flowBatt.dir = flowDirFromState(d.battFlowState);
    a.flowGrid.dir = flowDirFromState(d.gridFlowState);
    a.flowLoad.dir = flowDirFromState(d.loadFlowState);
    a.flowPv.dir = flowDirFromState(d.pvFlowState);
    a.statusPulseActive = d.battStatus !== 'standby';
    a.sunTargetOpacity = d.sunActive ? 1 : 0;
    a.rayActive = d.sunActive;
    a.smokeActive = d.smokeActive;
    if (d.smokeActive) {
      a.smoke[0].active = true;
      a.smoke[1].active = true;
      a.smoke[2].active = true;
    } else {
      a.smoke[0].active = false;
      a.smoke[1].active = false;
      a.smoke[2].active = false;
    }
  }, [d]);

  // Single unified rAF loop
  useEffect(() => {
    let running = true;
    let lastTime = performance.now();

    const tick = (time: number) => {
      if (!running) return;
      const dt = Math.min(time - lastTime, 100);
      lastTime = time;
      const a = animRef.current;

      // --- Flow lines ---
      const tickFlow = (f: FlowLineAnim, ref: React.RefObject<any>) => {
        if (f.dir !== 0) {
          f.opacity = Math.min(1, f.opacity + dt / 300);
          f.offset -= f.dir * 24 * (dt / 1000);
          if (f.offset >= 24) f.offset -= 24;
          if (f.offset < 0) f.offset += 24;
        } else {
          f.opacity = Math.max(0, f.opacity - dt / 300);
        }
        ref.current?.setNativeProps({
          strokeDashoffset: f.offset,
          opacity: f.opacity,
        });
      };

      tickFlow(a.flowBatt, battLineRef);
      tickFlow(a.flowGrid, gridLineRef);
      tickFlow(a.flowLoad, loadLineRef);
      tickFlow(a.flowPv, pvLineRef);

      // --- Status icon pulse ---
      if (a.statusPulseActive) {
        a.statusPulsePhase += dt;
        const period = 2000;
        const t = (a.statusPulsePhase % period) / period;
        const opacity = 0.5 + 0.5 * Math.cos(t * 2 * Math.PI);
        statusIconRef.current?.setNativeProps({ opacity });
      } else {
        statusIconRef.current?.setNativeProps({ opacity: 1 });
        a.statusPulsePhase = 0;
      }

      // --- Sun opacity (smooth transition) ---
      a.sunOpacity += (a.sunTargetOpacity - a.sunOpacity) * Math.min(1, dt / 200);
      sunGroupRef.current?.setNativeProps({ opacity: a.sunOpacity });

      // --- Ray pulse ---
      if (a.rayActive) {
        a.rayPhase += dt;
        const period = 3000;
        const t = (a.rayPhase % period) / period;
        const rayOp = 0.3 + 0.7 * (0.5 + 0.5 * Math.cos(t * 2 * Math.PI));
        rayGroupRef.current?.setNativeProps({ opacity: rayOp });
      } else {
        rayGroupRef.current?.setNativeProps({ opacity: 0.3 });
        a.rayPhase = 0;
      }

      // --- Smoke puffs ---
      const smokeRefs = [smoke1Ref, smoke2Ref, smoke3Ref];
      const SMOKE_DUR = 2500;
      for (let i = 0; i < 3; i++) {
        const puff = a.smoke[i];
        if (puff.active) {
          puff.phase += dt;
          if (puff.phase >= SMOKE_DUR) puff.phase -= SMOKE_DUR;
          const t = puff.phase / SMOKE_DUR;
          const cy = 4 - 1.5 * t;
          const r = 2.5 + 1 * t;
          const op = t < 0.05 ? t / 0.05 * 0.5 : 0.5 * (1 - t);
          smokeRefs[i].current?.setNativeProps({ cy, r, opacity: Math.max(0, op) });
        } else {
          smokeRefs[i].current?.setNativeProps({ opacity: 0 });
        }
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    return () => { running = false; };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.svgContainer}>
        <Svg
          viewBox="0 0 350 550"
          width={DIAGRAM_WIDTH}
          height={DIAGRAM_HEIGHT}
          preserveAspectRatio="xMidYMid meet"
        >
          <FlowLines
            battRef={battLineRef}
            loadRef={loadLineRef}
            gridRef={gridLineRef}
            pvRef={pvLineRef}
          />

          <BatteryNode
            batterySoc={d.batterySoc}
            batteryPower={d.batteryPower}
            battColor={d.battColor}
            waveActive={d.waveActive}
            waveDir={d.waveDir}
          />

          <StatusCards
            socLabel={props.t.monitor.soc}
            socValue={d.socValue}
            statusLabel={props.t.monitor.status}
            statusText={d.statusText}
            statusColor={d.statusColor}
            battStatus={d.battStatus}
            powerLabel={props.t.monitor.power}
            powerValue={d.battPowerValue}
            statusIconRef={statusIconRef}
          />

          <AiDecisionNode
            headerLabel={props.t.monitor.aiLogic}
            col1Label={props.t.monitor.ruleId}
            col2Label={props.t.monitor.action}
            col3Label={props.t.monitor.targetPower}
            ruleId={d.aiRuleId}
            actionText={d.aiAction}
            powerText={d.aiPower}
            aiColor={d.aiColor}
            powerColor={d.aiPowerColor}
          />

          <InverterHub />

          <GridNode
            label={props.t.monitor.grid}
            value={d.gridValue}
            arrowPath={d.gridArrowPath}
            arrowColor={d.gridArrowColor}
            avg1m={d.gridAvg1m}
            avg5m={d.gridAvg5m}
            avg1mLabel={props.t.energyFlow.avg1min}
            avg5mLabel={props.t.energyFlow.avg5min}
          />

          <LoadNode
            label={props.t.monitor.load}
            value={d.loadValue}
            smoke1Ref={smoke1Ref}
            smoke2Ref={smoke2Ref}
            smoke3Ref={smoke3Ref}
            avg1m={d.loadAvg1m}
            avg5m={d.loadAvg5m}
            avg1mLabel={props.t.energyFlow.avg1min}
            avg5mLabel={props.t.energyFlow.avg5min}
          />

          <PvNode
            label={props.t.monitor.pv}
            value={d.pvValue}
            sunGroupRef={sunGroupRef}
            rayGroupRef={rayGroupRef}
            avg1m={d.pvAvg1m}
            avg5m={d.pvAvg5m}
            avg1mLabel={props.t.energyFlow.avg1min}
            avg5mLabel={props.t.energyFlow.avg5min}
          />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  svgContainer: {
    width: DIAGRAM_WIDTH,
    height: DIAGRAM_HEIGHT,
  },
});
