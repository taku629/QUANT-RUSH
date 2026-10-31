import { useEffect, useState } from 'react';
import { audio } from '../game/audio';
import { DISTRICTS, VEHICLES, type VehicleId } from '../game/content';
import { useGame } from '../game/store';
import type { CameraMode } from '../game/storage';
import { HowTo } from './HowTo';

const CAMS: { id: CameraMode; label: string; jp: string }[] = [
  { id: 'standard', label: 'STANDARD', jp: '標準' },
  { id: 'dramatic', label: 'DRAMATIC', jp: '迫力' },
  { id: 'first', label: 'FIRST PERSON', jp: '一人称' },
];

export function Title() {
  const settings = useGame((s) => s.settings);
  const records = useGame((s) => s.records);
  const setSettings = useGame((s) => s.setSettings);
  const start = useGame((s) => s.start);
  const [how, setHow] = useState(false);
  const [opts, setOpts] = useState(false);
  const [seedText, setSeedText] = useState(settings.fixedSeed ? String(settings.fixedSeed) : '');

  const play = () => {
    audio.unlock();
    audio.click();
    start();
  };

  return (
    <div className="title-screen">
      <div className="title-top">
        <div className="logo">
          <div className="logo-kicker">NEO-TOKYO FINANCIAL DISTRICT · 2077</div>
          <h1 className="logo-main" data-text="QUANT RUSH">QUANT RUSH</h1>
          <div className="logo-sub">— MARKET MAKER —</div>
        </div>
        <p className="title-pitch">
          兜町から渋谷へ。ネオンの金融街を疾走し、<b>スプレッド</b>で稼ぎ、<b>在庫リスク</b>を制し、<b>暴落</b>を生き延びろ。
        </p>
        <div className="route-mini">
          {DISTRICTS.map((d, i) => (
            <span key={d.id} style={{ color: d.primary }}>
              {d.jp}
              {i < DISTRICTS.length - 1 && <i>›</i>}
            </span>
          ))}
        </div>
      </div>

      <div className="title-panel">
        <div className="vehicle-row">
          {(Object.keys(VEHICLES) as VehicleId[]).map((id) => {
            const v = VEHICLES[id];
            return (
              <button
                key={id}
                className={`vehicle-card ${settings.vehicle === id ? 'on' : ''}`}
                style={{ ['--vc' as string]: v.color }}
                onClick={() => {
                  audio.unlock();
                  audio.click();
                  setSettings({ vehicle: id });
                }}
              >
                <div className="vc-name">{v.name}</div>
                <div className="vc-desc">{v.desc}</div>
                <div className="vc-stats">
                  <Stat label="SPD" v={(v.baseSpeed - 30) / 12} />
                  <Stat label="AGI" v={(v.lateral - 16) / 9} />
                  <Stat label="JMP" v={(v.jumpVelocity - 8) / 2} />
                  <Stat label="HP" v={v.stability / 4} />
                </div>
              </button>
            );
          })}
        </div>

        <button className="play-btn" onClick={play} data-testid="play">
          <span>PLAY ARCADE</span>
          <small>Enter / Tap</small>
        </button>

        <div className="title-buttons">
          <button className="ghost-btn" onClick={() => setHow(true)}>HOW TO PLAY</button>
          <button className="ghost-btn" onClick={() => setOpts(!opts)}>SETTINGS</button>
          <button className="ghost-btn" onClick={() => setSettings({ sfx: !settings.sfx, music: !settings.sfx })}>
            {settings.sfx ? '🔊 SOUND ON' : '🔇 SOUND OFF'}
          </button>
        </div>

        {opts && (
          <div className="settings-box">
            <div className="set-row">
              <span>CAMERA 視点</span>
              <div className="seg">
                {CAMS.map((c) => (
                  <button key={c.id} className={settings.camera === c.id ? 'on' : ''} onClick={() => setSettings({ camera: c.id })}>
                    {c.jp}
                  </button>
                ))}
              </div>
            </div>
            <div className="set-row">
              <span>SCREEN ROLL 画面回転</span>
              <div className="seg">
                <button className={settings.roll ? 'on' : ''} onClick={() => setSettings({ roll: true })}>ON</button>
                <button className={!settings.roll ? 'on' : ''} onClick={() => setSettings({ roll: false })}>OFF</button>
              </div>
            </div>
            <div className="set-row">
              <span>QUALITY 画質</span>
              <div className="seg">
                <button className={settings.quality === 'high' ? 'on' : ''} onClick={() => setSettings({ quality: 'high' })}>HIGH</button>
                <button className={settings.quality === 'low' ? 'on' : ''} onClick={() => setSettings({ quality: 'low' })}>LOW</button>
              </div>
            </div>
            <div className="set-row">
              <span>SFX / MUSIC</span>
              <div className="seg">
                <button className={settings.sfx ? 'on' : ''} onClick={() => setSettings({ sfx: !settings.sfx })}>SFX {settings.sfx ? 'ON' : 'OFF'}</button>
                <button className={settings.music ? 'on' : ''} onClick={() => setSettings({ music: !settings.music })}>BGM {settings.music ? 'ON' : 'OFF'}</button>
              </div>
            </div>
            <div className="set-row">
              <span>MARKET SEED</span>
              <input
                inputMode="numeric"
                placeholder="random"
                value={seedText}
                onChange={(e) => {
                  const t = e.target.value.replace(/[^0-9]/g, '').slice(0, 9);
                  setSeedText(t);
                  setSettings({ fixedSeed: t ? Number(t) : null });
                }}
              />
            </div>
            <p className="set-note">同じシードなら同じ市場（価格・注文フロー・障害物配置）が再現されます。</p>
          </div>
        )}

        <div className="records">
          <div><span>BEST SCORE</span><b>{records.bestScore.toLocaleString()}</b></div>
          <div><span>BEST PnL</span><b>${records.bestPnL.toFixed(0)}</b></div>
          <div><span>TOP SPEED</span><b>{records.maxSpeed.toFixed(0)} km/h</b></div>
          <div><span>MAX COMBO</span><b>{records.maxCombo}</b></div>
        </div>
      </div>
      {how && <HowTo onClose={() => setHow(false)} />}
      <EnterToPlay onPlay={play} disabled={how} />
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="vc-stat">
      <span>{label}</span>
      <i style={{ width: `${Math.max(10, Math.min(100, v * 100))}%` }} />
    </div>
  );
}

function EnterToPlay({ onPlay, disabled }: { onPlay: () => void; disabled: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!disabled && e.key === 'Enter') onPlay();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onPlay, disabled]);
  return null;
}
