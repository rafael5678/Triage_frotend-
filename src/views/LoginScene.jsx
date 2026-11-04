/** Decorative login scene: CSS + SVG only. Hidden from assistive tech. */
export default function LoginScene() {
  return (
    <aside className="login-scene" aria-hidden="true">
      <div className="login-glow gold" />
      <div className="login-glow green" />
      <div className="login-glow terra" />
      <div className="login-grid" />
      <div className="login-ring r1" />
      <div className="login-ring r2" />
      <div className="login-ring r3" />
      <p className="login-kicker">Protocolo de prioridad</p>
      <p className="login-quote">Cinco niveles, una sola regla: la gravedad.</p>
      <div className="login-heart-wrap">
        <span className="login-heart">♥</span>
        <p className="login-bpm"><b>128</b> <small>lpm</small></p>
        <p className="login-monitor">Monitor de prioridad</p>
      </div>
      <svg className="login-ecg" viewBox="0 0 800 80" preserveAspectRatio="none">
        <path className="ecg-base" d="M0 40 H80 l10-6 8 22 12-48 10 38 8-6 H220 l10-6 8 22 12-48 10 38 8-6 H400 l10-6 8 22 12-48 10 38 8-6 H580 l10-6 8 22 12-48 10 38 8-6 H800" />
        <path className="ecg-live" d="M0 40 H80 l10-6 8 22 12-48 10 38 8-6 H220 l10-6 8 22 12-48 10 38 8-6 H400 l10-6 8 22 12-48 10 38 8-6 H580 l10-6 8 22 12-48 10 38 8-6 H800" />
      </svg>
      <article className="float-card c1"><span className="score-tile i">92</span><div><b>Crítica · 78–100</b><small>Atención ≈ 2 min</small></div></article>
      <article className="float-card c2"><span className="score-tile ii">70</span><div><b>Alta · 62–77</b><small>Atención ≈ 10 min</small></div></article>
      <article className="float-card c3"><span className="score-tile iii">51</span><div><b>Media · 42–61</b><small>Atención ≈ 30 min</small></div></article>
      <article className="float-card c4"><span className="score-tile iv">33</span><div><b>Baja · 22–41</b><small>Atención ≈ 60 min</small></div></article>
      <article className="float-card c5"><span className="score-tile v">12</span><div><b>Mínima · 0–21</b><small>Atención ≈ 120 min</small></div></article>
    </aside>
  );
}
