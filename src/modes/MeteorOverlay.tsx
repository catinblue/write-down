import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';

interface Meteor {
  birth: number;
  duration: number;
  startX: number;
  startY: number;
  angle: number;
  distance: number;
  trailLength: number;
  intensity: number;
}

interface Flash {
  birth: number;
  duration: number;
  x: number;
  y: number;
}

interface Props {
  trigger: number;
  active: boolean;
}

export function MeteorOverlay({ trigger, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const meteorsRef = useRef<Meteor[]>([]);
  const flashesRef = useRef<Flash[]>([]);
  const lastTriggerRef = useRef<number>(trigger);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (trigger === lastTriggerRef.current) return;
    lastTriggerRef.current = trigger;
    if (!active) return;
    // Vestibular motion: a streak crossing the viewport + a full-screen
    // whitewash flash. Both are skipped entirely under reduced-motion.
    if (reducedMotion) return;
    const m = createMeteor();
    meteorsRef.current.push(m);
    flashesRef.current.push({ birth: m.birth, duration: 0.75, x: m.startX, y: m.startY });
  }, [trigger, active, reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = performance.now();

      // flashes — soft radial whitewash at the meteor entry point
      const keptFlashes: Flash[] = [];
      for (const f of flashesRef.current) {
        const age = (now - f.birth) / 1000;
        if (age >= f.duration) continue;
        drawFlash(ctx, f, age);
        keptFlashes.push(f);
      }
      flashesRef.current = keptFlashes;

      // meteors
      const keptMeteors: Meteor[] = [];
      for (const m of meteorsRef.current) {
        const age = (now - m.birth) / 1000;
        if (age >= m.duration) continue;
        drawMeteor(ctx, m, age);
        keptMeteors.push(m);
      }
      meteorsRef.current = keptMeteors;

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 5, opacity: active ? 1 : 0, transition: 'opacity 1200ms ease-out' }}
      aria-hidden
    />
  );
}

function createMeteor(): Meteor {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const angleDeg = 200 + Math.random() * 35;
  const angle = (angleDeg * Math.PI) / 180;

  const fromTop = Math.random() < 0.6;
  const startX = fromTop ? W * (0.4 + Math.random() * 0.6) : W + 60;
  const startY = fromTop ? -40 : H * (0.0 + Math.random() * 0.35);

  const distance = Math.hypot(W, H) * 1.15;
  const duration = 1.7 + Math.random() * 0.9;
  const trailLength = 140 + Math.random() * 110;
  const intensity = 0.85 + Math.random() * 0.2;

  return { birth: performance.now(), duration, startX, startY, angle, distance, trailLength, intensity };
}

function drawMeteor(ctx: CanvasRenderingContext2D, m: Meteor, age: number) {
  const prog = age / m.duration;
  const eased = 1 - Math.pow(1 - prog, 2.4);
  const x = m.startX + Math.cos(m.angle) * m.distance * eased;
  const y = m.startY + Math.sin(m.angle) * m.distance * eased;

  const fadeIn = smoothstep(0, 0.06, prog);
  const fadeOut = 1 - smoothstep(0.7, 1, prog);
  const alpha = fadeIn * fadeOut * m.intensity;

  const dx = Math.cos(m.angle) * m.trailLength;
  const dy = Math.sin(m.angle) * m.trailLength;

  // trail gradient
  const grad = ctx.createLinearGradient(x, y, x - dx, y - dy);
  grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
  grad.addColorStop(0.25, `rgba(235,245,255,${alpha * 0.7})`);
  grad.addColorStop(0.6, `rgba(200,220,255,${alpha * 0.25})`);
  grad.addColorStop(1, 'rgba(200,220,255,0)');

  ctx.strokeStyle = grad;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - dx, y - dy);
  ctx.lineTo(x, y);
  ctx.stroke();

  // head: inner bright core + two outer glows
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(225,238,255,${alpha * 0.4})`;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(190,215,255,${alpha * 0.18})`;
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlash(ctx: CanvasRenderingContext2D, f: Flash, age: number) {
  const prog = age / f.duration;
  const env = Math.sin(prog * Math.PI);
  const alpha = env * 0.08;
  const r = Math.max(window.innerWidth, window.innerHeight) * 0.75;
  const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
  grad.addColorStop(0, `rgba(220,235,255,${alpha})`);
  grad.addColorStop(0.6, `rgba(220,235,255,${alpha * 0.25})`);
  grad.addColorStop(1, 'rgba(220,235,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
