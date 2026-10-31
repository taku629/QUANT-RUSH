import { LANES } from '../sim/config';
import { LANE_COLORS } from '../game/content';
import { GAME_RULES } from '../game/session';

export function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box howto" onClick={(e) => e.stopPropagation()}>
        <h2>HOW TO PLAY</h2>
        <section>
          <h3>操作</h3>
          <table className="keys">
            <tbody>
              <tr><td>A / ← ・ D / →</td><td>レーン移動（左スワイプ / 右スワイプ）</td></tr>
              <tr><td>W / ↑</td><td>ジャンプ（上スワイプ）— 低いバリアを飛び越える</td></tr>
              <tr><td>SPACE</td><td>HEDGE：在庫をゼロにする（コストあり・{3}秒クールダウン）</td></tr>
              <tr><td>SHIFT / S / ↓</td><td>ALPHA DRIVE 発動（ゲージ満タン時・下スワイプ）</td></tr>
              <tr><td>C</td><td>カメラ切替（標準 / 迫力 / 一人称）</td></tr>
              <tr><td>P / ESC</td><td>ポーズ</td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <h3>あなたはマーケットメイカー</h3>
          <p>走っているレーンが<b>提示スプレッド</b>になります。前方から飛んでくる光の玉は他の投資家の注文（緑=買い / 赤=売り）。玉の<b>リングの数</b>は「どこまで広いスプレッドを払ってくれるか」。リングが足りないレーンでは約定しません。</p>
          <div className="lanes-explain">
            {LANES.map((l, i) => (
              <div key={l.id} style={{ borderColor: LANE_COLORS[i] }}>
                <b style={{ color: LANE_COLORS[i] }}>{['LEFT', 'CENTER', 'RIGHT'][i]} · {l.name}</b>
                <span>スプレッド ±{(l.halfSpread * 100).toFixed(0)}¢ · リング{i + 1}個以上で約定</span>
                <small>{['約定しやすいが、1回の利益は小さく情報トレーダーにも狙われやすい', 'バランス型', '約定は減るが1回の利益が大きく、急変動に強い'][i]}</small>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3>リスク管理</h3>
          <ul>
            <li>買い注文に売ると在庫がマイナス、売り注文から買うと在庫がプラスに。<b>在庫は価格変動の影響を受けます</b>。</li>
            <li>市場は <b>CALM → TRENDING → VOLATILE → CRASH</b> と変化。レジームによって有利なレーンが変わります。</li>
            <li>各地区の終点 <b>SETTLEMENT GATE</b> では在庫チェック。|在庫| ≤ {GAME_RULES.gateInventoryLimit} なら +{GAME_RULES.gatePassBonus}秒、超過なら +{GAME_RULES.gateFailBonus}秒のみ。</li>
            <li>障害物に衝突すると転倒し、しばらく<b>クォート停止</b>（約定できない）。耐久がゼロで KNOCKOUT。</li>
            <li>PnL が −$3,000 に達すると <b>STOPPED OUT</b>（損切り）。</li>
          </ul>
        </section>
        <section>
          <h3>コンボ & ALPHA DRIVE</h3>
          <p>約定・ニアミス・ゲート通過でコンボが伸び、スコア倍率が上昇。ニアミスや約定でゲージが溜まると <b>ALPHA DRIVE</b>：無敵・超加速・障害物破壊、さらに取引所の<b>メイカーリベート</b>（1株 $0.01、PnLに別建て計上）を受け取れます。損失が消えるわけではありません。</p>
        </section>
        <button className="play-btn small" onClick={onClose}>OK</button>
      </div>
    </div>
  );
}
