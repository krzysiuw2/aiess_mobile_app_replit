import { Device, LiveData, OptimizedScheduleRule } from '@/types';

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

export const mockRules: OptimizedScheduleRule[] = [
  {
    id: 'CHARGE-TO-50',
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
    },
    d: 'weekdays',
  },
  {
    id: 'SURPLUS-FARM',
    a: {
      t: 'ch',
      pw: 125,
    },
    c: {
      ts: 600,
      te: 1400,
    },
    d: 'weekdays',
  },
];
