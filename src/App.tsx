import { useEffect } from 'react';
import { audio } from './game/audio';
import { attachInput } from './game/input';
import { useGame } from './game/store';
import { GameCanvas } from './scene/GameCanvas';
import { Countdown, Hud, PauseMenu } from './ui/Hud';
import { Learning } from './ui/Learning';
import { Results } from './ui/Results';
import { Title } from './ui/Title';

export function App() {
  const phase = useGame((s) => s.phase);
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

  return (
    <div className={`app phase-${phase}`}>
      <div className="canvas-wrap">
        <GameCanvas />
      </div>
      <div id="flash" className="flash" />
      <div className="scanlines" />
      {phase === 'title' && <Title />}
      {(phase === 'countdown' || phase === 'playing' || phase === 'paused' || phase === 'ending') && <Hud />}
      {phase === 'countdown' && <Countdown />}
      {phase === 'paused' && <PauseMenu />}
      {phase === 'results' && <Results />}
      {phase === 'learning' && <Learning />}
    </div>
  );
}
