import { useEffect, useRef } from 'react';

type Layer = { color: string; alpha: number; freq: number; phase: number; speed: number; amp: number; center: number; width: number };

const LAYERS: Layer[] = [
  { color: '207,229,188', alpha: 0.75, freq: 1.0, phase: 0.0, speed: 0.35, amp: 1.0, center: 0.42, width: 0.3 },
  { color: '169,207,143', alpha: 0.55, freq: 1.4, phase: 1.7, speed: 0.48, amp: 0.82, center: 0.6, width: 0.24 },
  { color: '141,190,114', alpha: 0.45, freq: 1.9, phase: 3.1, speed: 0.6, amp: 0.66, center: 0.33, width: 0.18 },
  { color: '169,207,143', alpha: 0.35, freq: 2.3, phase: 4.4, speed: 0.42, amp: 0.55, center: 0.7, width: 0.14 },
];

export default function VoiceWave({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let disposed = false;
    let raf = 0;
    let timer: number | undefined;
    let w = 0, h = 0;
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reduce = preference?.matches ?? false;
    const onMotionChange = () => { reduce = preference?.matches ?? false; };
    preference?.addEventListener('change', onMotionChange);

    // Audio
    let ac: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let buf: Uint8Array<ArrayBuffer> | null = null;
    const AC: typeof AudioContext | undefined = typeof window !== 'undefined'
      ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
    if (stream && AC && stream.getAudioTracks().length) {
      try {
        ac = new AC();
        source = ac.createMediaStreamSource(stream);
        analyser = ac.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser); // never to destination
        buf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        if (ac.state === 'suspended') ac.resume().catch(() => { /* render softly */ });
      } catch {
        try { source?.disconnect(); } catch { /* noop */ }
        if (ac) ac.close().catch(() => {});
        ac = null; source = null; analyser = null; buf = null;
      }
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      w = Math.max(1, rect.width); h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);

    let level = 0;
    const start = performance.now();

    const draw = (now: number) => {
      if (disposed) return;
      const t = reduce ? 0.6 : (now - start) / 1000;
      let raw = 0;
      if (analyser && buf && ac?.state === 'running') {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        raw = Math.min(1, Math.sqrt(sum / buf.length) * 5);
      }
      level += (raw - level) * (raw > level ? 0.18 : 0.05);
      const lv = reduce ? Math.min(level, 0.15) : level;
      const breath = 0.5 + 0.5 * Math.sin(t * 1.1);

      ctx.clearRect(0, 0, w, h);
      const mid = h / 2, pad = 10, x0 = pad, x1 = w - pad, span = x1 - x0;
      const maxH = h / 2 - 6;
      const N = 80;

      LAYERS.forEach((L, li) => {
        const drift = reduce ? 0 : Math.sin(t * L.speed + L.phase) * 0.06 * (0.4 + lv);
        const c = L.center + drift;
        const top: [number, number][] = [], bot: [number, number][] = [];
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          const taper = Math.pow(Math.sin(Math.PI * u), 1.6);
          const lobe = Math.exp(-Math.pow((u - c) / L.width, 2));
          const ripple = 1 + 0.18 * Math.sin(u * Math.PI * 2 * L.freq + t * L.speed * 2 + L.phase);
          const base = 0.16 + 0.06 * breath;
          const amp = Math.min(maxH * .95, maxH * L.amp * taper * (0.08 + lobe * (base + lv * 0.85)) * ripple);
          const off = reduce ? 0 : Math.sin(u * 3 + t * 0.7 + li) * 2 * (0.3 + lv);
          const x = x0 + u * span;
          top.push([x, mid + off - amp]);
          bot.push([x, mid + off + amp * (0.86 + 0.14 * Math.sin(t + li))]);
        }
        ctx.beginPath();
        ctx.moveTo(top[0][0], top[0][1]);
        for (let i = 1; i < top.length; i++) ctx.lineTo(top[i][0], top[i][1]);
        for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
        ctx.closePath();
        ctx.fillStyle = `rgba(${L.color},${L.alpha})`;
        ctx.fill();
      });

      // tail line + end dots
      ctx.strokeStyle = 'rgba(141,190,114,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x1, mid); ctx.stroke();
      ctx.fillStyle = 'rgba(141,190,114,0.9)';
      for (const x of [x0, x1]) { ctx.beginPath(); ctx.arc(x, mid, 3, 0, Math.PI * 2); ctx.fill(); }

      if (!reduce || raw > 0) raf = requestAnimationFrame(draw);
      else timer = window.setTimeout(() => draw(performance.now()), 200);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf); window.clearTimeout(timer);
      preference?.removeEventListener('change', onMotionChange);
      ro?.disconnect();
      try { source?.disconnect(); } catch { /* noop */ }
      try { analyser?.disconnect(); } catch { /* noop */ }
      if (ac && ac.state !== 'closed') ac.close().catch(() => {});
      // stream tracks intentionally untouched: the recorder owns them
    };
  }, [stream]);

  return (
    <div style={{ width: '100%', margin: '8px 0 12px' }}>
      <canvas ref={canvasRef} aria-hidden="true" data-testid="voice-wave"
        style={{ display: 'block', width: '100%', height: 120 }} />
    </div>
  );
}
