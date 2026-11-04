import { useCallback, useEffect, useState } from 'react';
import { audio } from './game/audio';
import { attachInput } from './game/input';
import { useGame } from './game/store';
import { GameCanvas } from './scene/GameCanvas';
import { webglAvailable } from './scene/quality';
import { Countdown, FpsCounter, Hud, PauseMenu } from './ui/Hud';
import { Learning } from './ui/Learning';
import { QuantLab } from './ui/QuantLab';
import { Results } from './ui/Results';
import { Title } from './ui/Title';

function GlError({ lost }: { lost: boolean }) {
  return (
    <div className="modal gl-error" data-testid="gl-error">
      <div className="modal-box">
        <h2>{lost ? 'GRAPHICS RESET' : 'WEBGL UNAVAILABLE'}</h2>
        <p>
          {lost
            ? 'GPU のコンテキストが失われました（端末の省電力やメモリ不足で起こることがあります）。'
            : 'このブラウザ / 端末では 3D 表示（WebGL）が使えません。'}
        </p>
        <ul>
          <li>ブラウザを最新版にする / 別のブラウザ（Chrome, Safari, Edge, Firefox）で開く</li>
          <li>ブラウザ設定の「ハードウェアアクセラレーション」を有効にする</li>
          <li>他のタブやアプリを閉じてから再読み込みする</li>
          <li>再開後はタイトルの SETTINGS で画質を LOW にすると安定します</li>
        </ul>
        <button className="play-btn small" onClick={() => window.location.reload()}>RELOAD</button>
      </div>
    </div>
  );
}

export function App() {
  const phase = useGame((s) => s.phase);
  const [gl] = useState(() => webglAvailable());
  const [lost, setLost] = useState(false);
  const onLost = useCallback(() => {
    useGame.getState().pause();
    setLost(true);
  }, []);
  useEffect(() => {
    const st = useGame.getState();
    audio.setSfx(st.settings.sfx);
    audio.setMusic(st.settings.music);
    const detach = attachInput({
      onPause: () => useGame.getState().togglePause(),
      isPlaying: () => useGame.getState().phase === 'playing',
      onCamera: () => useGame.getState().cycleCamera(),
    });
    const onVis = () => {
      if (document.hidden) useGame.getState().pause();
    };
    const unlock = () => audio.unlock();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      detach();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  if (!gl) return <GlError lost={false} />;
  return (
    <div className={`app phase-${phase}`}>
      <div className="canvas-wrap">
        <GameCanvas onContextLost={onLost} />
      </div>
      <div id="flash" className="flash" />
      <div className="scanlines" />
      {phase === 'title' && <Title />}
      {(phase === 'countdown' || phase === 'playing' || phase === 'paused' || phase === 'ending') && <Hud />}
      {phase === 'countdown' && <Countdown />}
      {phase === 'paused' && <PauseMenu />}
      {phase === 'results' && <Results />}
      {phase === 'learning' && <Learning />}
      {phase === 'lab' && <QuantLab />}
      {lost && <GlError lost />}
      <FpsCounter />
    </div>
  );
}
