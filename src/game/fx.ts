/** Mutable visual-effects bus shared between the game loop and the 3D scene (no React re-renders). */
export type Burst = { x: number; y: number; z: number; color: string; count: number; speed: number; life: number };

export const fx = {
  shake: 0,
  flash: 0,
  flashColor: '#ffffff',
  bursts: [] as Burst[],
  /** orderId → outcome, read by the order-orb renderer when an orb arrives */
  orderOutcome: new Map<number, 'fill' | 'miss'>(),
  lightning: 0,
  fovKick: 0,
  slowmo: 1,
  reset() {
    this.shake = 0;
    this.flash = 0;
    this.bursts.length = 0;
    this.orderOutcome.clear();
    this.lightning = 0;
    this.fovKick = 0;
    this.slowmo = 1;
  },
  burst(b: Partial<Burst> & { color: string }) {
    this.bursts.push({ x: 0, y: 1, z: 0, count: 24, speed: 8, life: 0.7, ...b });
  },
};
