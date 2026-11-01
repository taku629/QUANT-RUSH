/**
 * First-play tutorial + contextual coaching tips.
 * Tips are short, accurate and triggered by the actual situation (once per run per tip, with a cooldown).
 */
import { GAME_RULES, type GameSession } from './session';

export type Tip = { id: string; title: string; body: string; tone: 'info' | 'warn' | 'good' };

type Step = { id: string; title: string; body: string; done: (s: GameSession, t: number) => boolean };

export const TUTORIAL: Step[] = [
  { id: 'steer', title: '← → / スワイプでレーン移動', body: '障害物をよけながら走ろう', done: (s, t) => s.laneChanges >= 2 || t > 7 },
  { id: 'lane', title: 'レーン = あなたのスプレッド', body: '左 ±2¢：約定しやすいが1回の利益は小さい / 右 ±10¢：約定は減るが利益大', done: (_, t) => t > 5 },
  { id: 'orders', title: '光の玉 = 他の投資家の注文', body: '緑=買い 赤=売り。リングの数が足りるレーンにいれば約定（左:1個〜 右:3個）', done: (s, t) => (s.engine.fills.length >= 2 && t > 3) || t > 8 },
  { id: 'jump', title: '↑ / 上スワイプでジャンプ', body: '低いバリアは飛び越えられる。ランプに乗れば大ジャンプ', done: (s, t) => s.jumps + s.ramps >= 1 || t > 9 },
  { id: 'hedge', title: '在庫が偏ったら SPACE / HEDGE', body: '在庫は価格変動リスク。ヘッジでゼロに戻せる（手数料あり・3秒待ち）', done: (s, t) => s.engine.hedges.length >= 1 || t > 7 },
  { id: 'gate', title: `ゲートで |在庫| ≤ ${GAME_RULES.gateInventoryLimit} なら時間延長！`, body: 'ニアミスでALPHAゲージを溜めて SHIFT / ↓ / 下スワイプ。さあ、本番！', done: (_, t) => t > 5 },
];

export class Tutorial {
  step = 0;
  t = 0;
  active: boolean;
  constructor(enabled: boolean) {
    this.active = enabled;
  }
  get current() {
    return this.active ? TUTORIAL[this.step] : null;
  }
  tick(s: GameSession, dt: number): boolean {
    if (!this.active) return false;
    this.t += dt;
    if (TUTORIAL[this.step].done(s, this.t)) {
      this.step++;
      this.t = 0;
      if (this.step >= TUTORIAL.length) {
        this.active = false;
        return true; // finished
      }
    }
    return false;
  }
  skip() {
    this.active = false;
  }
}

export class Coach {
  private shown = new Set<string>();
  private cooldown = 4;
  tick(s: GameSession, dt: number): Tip | null {
    this.cooldown -= dt;
    if (this.cooldown > 0 || s.t < 3) return null;
    const e = s.engine;
    const sig = e.signals();
    const inv = e.inventory;
    const g = s.nextGate;
    const cands: Tip[] = [];
    if (Math.abs(inv) >= 600) cands.push({ id: 'inv', tone: 'warn', title: '在庫が偏っている！', body: 'HEDGE で在庫をゼロに戻すと価格変動リスクが消える（コストと引き換え）' });
    if (g && g.z - s.z < 220 && g.z - s.z > 80 && Math.abs(inv) > GAME_RULES.gateInventoryLimit)
      cands.push({ id: 'gate', tone: 'warn', title: 'ゲートが近い：在庫チェック', body: `|在庫| ≤ ${GAME_RULES.gateInventoryLimit} で通過すると時間延長が大きい` });
    if (sig.read === 'ONE_SIDED') cands.push({ id: 'onesided', tone: 'warn', title: '注文が一方向に偏っている', body: '理由のない偏り＋同じ向きの値動きは「情報を持つ相手」のサイン。右へ（広いスプレッド）' });
    if (sig.read === 'ANNOUNCED') cands.push({ id: 'sweep', tone: 'info', title: '公表済みの大口フロー', body: '理由が公表された強制売買は一時的に価格を押すだけ。急いでヘッジしなくてよい' });
    if (sig.read === 'RUSH') cands.push({ id: 'rush', tone: 'good', title: '小口注文が殺到', body: 'リングの少ない注文がたくさん。左（狭いスプレッド）で回転を稼ぐチャンス' });
    if (s.quoteLane === 0 && e.realizedVol() > 0.06) cands.push({ id: 'tightvol', tone: 'warn', title: '値動きが荒い中で狭いスプレッド', body: '狭いスプレッドは注文が入りやすいが、急変動で損をしやすい' });
    if (e.fills.some((f) => f.toxic) && !this.shown.has('toxic')) cands.push({ id: 'toxic', tone: 'info', title: 'TOXIC FLOW とは', body: '約定の2秒後に価格が不利に動いた取引。相手が先を知っていた可能性（逆選択）' });
    if (e.visibleOrders().some((o) => o.block !== undefined)) cands.push({ id: 'block', tone: 'info', title: 'BLOCK 注文が接近', body: '大口注文はそのレーンを通った時だけ約定。在庫が一気に偏るので注意' });
    const tip = cands.find((c) => !this.shown.has(c.id));
    if (!tip) return null;
    this.shown.add(tip.id);
    this.cooldown = 7;
    return tip;
  }
}
