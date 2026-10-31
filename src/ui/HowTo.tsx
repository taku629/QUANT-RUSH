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
              <tr><td>A / ← ・ D / →</td><td>レーン移動（左右スワイプ。1回のタッチで続けてスワイプ可）</td></tr>
              <tr><td>W / ↑</td><td>ジャンプ（上スワイプ）— 低いバリアを飛び越える</td></tr>
              <tr><td>SPACE</td><td>HEDGE：在庫をゼロにする（コストあり・{3}秒クールダウン）</td></tr>
              <tr><td>SHIFT / S / ↓</td><td>ALPHA DRIVE 発動（ゲージ満タン時・下スワイプ）</td></tr>
              <tr><td>C / P・ESC</td><td>カメラ切替（標準 / 迫力 / 一人称）/ ポーズ</td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <h3>あなたはマーケットメイカー</h3>
          <p>走っているレーンが<b>提示スプレッド</b>（買値と売値の幅）になります。前方から飛んでくる光の玉は他の投資家の注文（緑=買い / 赤=売り）。玉の<b>リングの数</b>は「その注文がどこまで広いスプレッドを払うか」。リングが足りないレーンでは約定しません。</p>
          <div className="lanes-explain">
            {LANES.map((l, i) => (
              <div key={l.id} style={{ borderColor: LANE_COLORS[i] }}>
                <b style={{ color: LANE_COLORS[i] }}>{['LEFT', 'CENTER', 'RIGHT'][i]} · {l.name}</b>
                <span>スプレッド ±{(l.halfSpread * 100).toFixed(0)}¢ · リング{i + 1}個以上</span>
                <small>{['注文は入りやすいが1回の利益は小さく、価格が急に動くと損をしやすい', 'バランス型', '1回の利益は大きいが、他のマーケットメイカーに注文を取られやすい'][i]}</small>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3>テープを読む（TAPE パネル）</h3>
          <ul>
            <li><b>FLOW</b>：見えている注文と直近の約定の売り/買いの偏り。<b>理由のない一方向の偏り＋同じ向きの値動き</b>は、先を知っている「情報トレーダー」の可能性。右（広いスプレッド）に避難し、在庫をヘッジ。</li>
            <li><b>小口注文の殺到（RUSH）</b>：リングの少ない注文が両方向からたくさん。左（狭いスプレッド）で回転を稼ぐチャンス。</li>
            <li><b>NEWS（公表済みの大口フロー）</b>：リバランス等で理由が分かっている売買。価格は一時的に押されて戻りやすいので、慌ててヘッジしなくてよい。</li>
            <li>レジーム（CALM / TRENDING / VOLATILE / CRASH）はボラティリティとヘッジ費用の目安。<b>最適なレーンはレジームだけでは決まりません</b>。</li>
          </ul>
        </section>
        <section>
          <h3>走行とリスク管理</h3>
          <ul>
            <li><b>BLOCK 注文</b>（六角形のゲート）は大口注文。そのレーンを通った時だけ約定し、在庫が一気に偏ります。</li>
            <li><b>分岐</b>では中央の壁を越えられません。ルート選び＝スプレッド選びです。</li>
            <li>ランプで大ジャンプ、黄色い矢印でブースト。ヘッドライトと赤い矢印は<b>対向車</b>の警告。</li>
            <li>各地区の終点 <b>SETTLEMENT GATE</b>：|在庫| ≤ {GAME_RULES.gateInventoryLimit} なら大きく時間延長（先の地区ほど少なめ）、超過なら +{GAME_RULES.gateFailBonus}秒のみ。</li>
            <li>衝突すると転倒して約 {GAME_RULES.offlineTime} 秒<b>クォート停止</b>（約定できない）。耐久ゼロで KNOCKOUT、PnL −$3,000 で STOPPED OUT。</li>
          </ul>
        </section>
        <section>
          <h3>ALPHA DRIVE</h3>
          <p>ニアミス・約定・ジャンプでゲージを溜めて発動：{GAME_RULES.alphaDuration}秒間の無敵・超加速・障害物破壊。取引所の流動性提供プログラムとして<b>メイカーリベート（1株 $0.01）</b>を受け取り、<b>ヘッジの取引手数料（1株 $0.01）が免除</b>されます。どちらもPnLに別建てで計上され、損失そのものは消えません。</p>
        </section>
        <section>
          <h3>用語</h3>
          <ul>
            <li><b>PnL</b> = 現金 + 在庫 × 仲値 − 初期資産</li>
            <li><b>マークアウト</b>：約定の2秒後の仲値で評価した取引の損益。マイナスが続くなら逆選択（先を知る相手との取引）を受けている</li>
            <li><b>1s VaR95</b>：直近の値動きの荒さから見た、1秒間に在庫で失う可能性のある金額の目安（95%）</li>
            <li><b>RAR</b>：ゲーム独自のリスク調整後リターン = PnL ÷ (1秒ごとのPnL変化の標準偏差×√秒数)。年率Sharpe Ratioとは異なります</li>
          </ul>
        </section>
        <button className="play-btn small" onClick={onClose}>OK</button>
      </div>
    </div>
  );
}
