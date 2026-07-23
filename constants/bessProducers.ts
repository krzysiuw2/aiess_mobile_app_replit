/**
 * BESS producer per site_id — drives alarm code semantics.
 * Roche: discrete-input bit index + 1 (1..57) with named alarms.
 * Wincle: raw non-zero fault register values.
 * See aiess-architecture ADR 0011 / contracts/influx-schema.md.
 */

export type BessProducer = 'roche' | 'wincle';

const SITE_BESS_PRODUCER: Record<string, BessProducer> = {
  lempert_1: 'roche',
  olmar_1: 'wincle',
  domagala_1: 'wincle',
};

export function getBessProducer(siteId: string): BessProducer {
  return SITE_BESS_PRODUCER[siteId] ?? 'wincle';
}
