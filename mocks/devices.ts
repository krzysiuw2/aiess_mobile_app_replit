import { Device, LiveData, Rule } from '@/types';

export const mockDevices: Device[] = [
  {
    id: '1',
    device_id: 'Site1',
    name: 'Name1',
    status: 'active',
    device_type: 'hybrid',
    location: 'Warsaw, Poland',
    battery_capacity_kwh: 568,
    pcs_power_kw: 305,
    pv_power_kw: 200,
  },
  {
    id: '2',
    device_id: 'Site2',
    name: 'Name2',
    status: 'active',
    device_type: 'on_grid',
    location: 'Krakow, Poland',
    battery_capacity_kwh: 289,
    pcs_power_kw: 135,
    pv_power_kw: 50,
  },
];

export const mockLiveData: LiveData = {
  gridPower: 20,
  batteryPower: -20,
  batterySoc: 65.4,
  batteryStatus: 'Discharging',
  pvPower: 0,
  factoryLoad: 40,
  lastUpdate: new Date(),
};

export const mockRules: Rule[] = [
  {
    id: 'CHARGE-TO-50',
    p: 7,
    a: {
      t: 'ct',
      soc: 50,
      maxp: 30,
      maxg: 25,
      str: 'eq',
    },
    c: {
      ts: 600,
      te: 1400,
      d: '1234567',
      vf: 1722470400,
    },
    act: true,
  },
  {
    id: 'SUPLUS-FARM',
    p: 7,
    a: {
      t: 'ch',
      pw: 125,
      maxg: 0,
    },
    c: {
      ts: 600,
      te: 1400,
      d: '1234567',
      vf: 1722470400,
    },
    act: true,
  },
];

export const getActionTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    ch: 'Charge',
    dis: 'Discharge',
    sb: 'Standby',
    ct: 'Charge to SoC',
    dt: 'Discharge to SoC',
    sl: 'Site Limit',
  };
  return labels[type] || type;
};

export const formatTime = (time: number): string => {
  const hours = Math.floor(time / 100);
  const minutes = time % 100;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

export const getDaysLabel = (days: string): string => {
  if (days === '1234567') return 'Everyday';
  if (days === '12345') return 'Mon-Fri';
  if (days === '67') return 'Weekends';
  return days.split('').map(d => ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][parseInt(d)]).join(', ');
};
