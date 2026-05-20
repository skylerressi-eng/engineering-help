import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Play,
  Pause,
  RotateCcw,
  Shuffle,
  Gauge,
  Target,
  Keyboard,
  Cpu,
} from 'lucide-react';
import type { AppModule } from '@/os/types';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';

/**
 * Top-down 2D differential-drive robot simulator. World is a rectangular
 * arena in metres; the robot is a circular chassis with two wheels and
 * three forward-facing ultrasonic-style range sensors. Manual driving uses
 * WASD/arrows; the auto mode is a simple obstacle-avoiding wanderer.
 */

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SimState {
  // Pose & velocity
  x: number;
  y: number;
  theta: number;
  vL: number; // current left wheel speed (m/s)
  vR: number;
  cmdL: number; // commanded
  cmdR: number;
  // Mission
  goal: { x: number; y: number };
  reached: boolean;
  startTime: number;
  bestTime: number | null;
  distance: number;
  // World
  obstacles: Obstacle[];
  trail: number[]; // flat [x, y, ...]
  // Sensor readings (m)
  sensors: [number, number, number];
}

const ARENA_W = 12;
const ARENA_H = 8;
const ROBOT_R = 0.25;
const WHEEL_BASE = 0.45;
const SENSOR_RANGE = 3.0;
const SENSOR_ANGLES = [-0.55, 0, 0.55]; // rad off forward

function newObstacles(n: number): Obstacle[] {
  const obs: Obstacle[] = [];
  let tries = 0;
  while (obs.length < n && tries < 400) {
    tries++;
    const w = 0.4 + Math.random() * 0.9;
    const h = 0.4 + Math.random() * 0.9;
    const x = 1 + Math.random() * (ARENA_W - 2 - w);
    const y = 1 + Math.random() * (ARENA_H - 2 - h);
    // Keep clear of the spawn point (bottom-left corner) and goal (top-right)
    const clearOf = (cx: number, cy: number, r: number) =>
      cx < x - r || cx > x + w + r || cy < y - r || cy > y + h + r;
    if (!clearOf(1.0, ARENA_H - 1.0, 0.8)) continue;
    if (!clearOf(ARENA_W - 1.0, 1.0, 0.8)) continue;
    obs.push({ x, y, w, h });
  }
  return obs;
}

function freshState(obstacles = newObstacles(6)): SimState {
  return {
    x: 1.0,
    y: ARENA_H - 1.0,
    theta: -Math.PI / 4,
    vL: 0,
    vR: 0,
    cmdL: 0,
    cmdR: 0,
    goal: { x: ARENA_W - 1.0, y: 1.0 },
    reached: false,
    startTime: performance.now(),
    bestTime: null,
    distance: 0,
    obstacles,
    trail: [],
    sensors: [SENSOR_RANGE, SENSOR_RANGE, SENSOR_RANGE],
  };
}

/** Ray–AABB intersection; returns t along the ray (∞ if miss). */
function rayAabb(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  ax: number,
  ay: number,
  aw: number,
  ah: number,
): number {
  const inv = (v: number) => (Math.abs(v) < 1e-9 ? Infinity * Math.sign(v || 1) : 1 / v);
  const ix = inv(dx);
  const iy = inv(dy);
  const t1 = (ax - ox) * ix;
  const t2 = (ax + aw - ox) * ix;
  const t3 = (ay - oy) * iy;
  const t4 = (ay + ah - oy) * iy;
  const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
  const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));
  if (tmax < 0 || tmin > tmax) return Infinity;
  return tmin >= 0 ? tmin : tmax;
}

function castRay(s: SimState, fromX: number, fromY: number, angle: number): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = SENSOR_RANGE;
  // Arena walls as four AABBs
  const walls: Obstacle[] = [
    { x: -1, y: -1, w: ARENA_W + 2, h: 1 }, // top
    { x: -1, y: ARENA_H, w: ARENA_W + 2, h: 1 }, // bottom
    { x: -1, y: -1, w: 1, h: ARENA_H + 2 }, // left
    { x: ARENA_W, y: -1, w: 1, h: ARENA_H + 2 }, // right
  ];
  for (const o of [...walls, ...s.obstacles]) {
    const t = rayAabb(fromX, fromY, dx, dy, o.x, o.y, o.w, o.h);
    if (t > 0 && t < best) best = t;
  }
  return best;
}

function collideWithAabb(s: SimState, o: Obstacle): boolean {
  // Closest point on AABB to circle center
  const cx = Math.max(o.x, Math.min(s.x, o.x + o.w));
  const cy = Math.max(o.y, Math.min(s.y, o.y + o.h));
  const dx = s.x - cx;
  const dy = s.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 < ROBOT_R * ROBOT_R) {
    const d = Math.sqrt(d2) || 1e-6;
    const push = ROBOT_R - d;
    s.x += (dx / d) * push;
    s.y += (dy / d) * push;
    return true;
  }
  return false;
}

function step(s: SimState, dt: number, maxV: number, wheelTau: number) {
  // First-order lag on the wheels (motor smoothing)
  const a = Math.min(1, dt / wheelTau);
  s.vL += (s.cmdL - s.vL) * a;
  s.vR += (s.cmdR - s.vR) * a;
  s.vL = Math.max(-maxV, Math.min(maxV, s.vL));
  s.vR = Math.max(-maxV, Math.min(maxV, s.vR));
  const v = (s.vL + s.vR) * 0.5;
  const w = (s.vR - s.vL) / WHEEL_BASE;
  const px = s.x;
  const py = s.y;
  s.theta += w * dt;
  s.x += Math.cos(s.theta) * v * dt;
  s.y += Math.sin(s.theta) * v * dt;

  // Arena walls (clamp inside)
  if (s.x < ROBOT_R) s.x = ROBOT_R;
  if (s.x > ARENA_W - ROBOT_R) s.x = ARENA_W - ROBOT_R;
  if (s.y < ROBOT_R) s.y = ROBOT_R;
  if (s.y > ARENA_H - ROBOT_R) s.y = ARENA_H - ROBOT_R;

  // Obstacle collisions
  for (const o of s.obstacles) collideWithAabb(s, o);

  // Distance travelled & trail
  s.distance += Math.hypot(s.x - px, s.y - py);
  s.trail.push(s.x, s.y);
  if (s.trail.length > 1200) s.trail.splice(0, s.trail.length - 1200);

  // Sensors
  s.sensors = SENSOR_ANGLES.map((a) =>
    castRay(s, s.x, s.y, s.theta + a),
  ) as [number, number, number];

  // Goal
  if (
    !s.reached &&
    Math.hypot(s.x - s.goal.x, s.y - s.goal.y) < ROBOT_R + 0.25
  ) {
    s.reached = true;
    const t = (performance.now() - s.startTime) / 1000;
    if (s.bestTime === null || t < s.bestTime) s.bestTime = t;
  }
}

function autoControl(s: SimState, maxV: number): [number, number] {
  // Simple reactive controller: drive forward, slow & turn away from
  // whichever side is closer to an obstacle.
  const [l, c, r] = s.sensors;
  if (c < 0.7 || l < 0.5 || r < 0.5) {
    if (l < r) return [maxV * 0.7, -maxV * 0.4];
    return [-maxV * 0.4, maxV * 0.7];
  }
  const bias = (r - l) * 0.3; // gentle steering toward more open side
  return [
    Math.min(maxV, maxV * (0.8 + bias)),
    Math.min(maxV, maxV * (0.8 - bias)),
  ];
}

function RobotSim({ appId }: { appId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<SimState>(freshState());
  const keysRef = useRef<Set<string>>(new Set());
  const [, force] = useState(0);
  const [running, setRunning] = useState(true);
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [maxV, setMaxV] = useState(2.5);
  const [wheelTau, setWheelTau] = useState(0.2);
  const [obstacleCount, setObstacleCount] = useState(6);
  const [showSensors, setShowSensors] = useState(true);
  const [showTrail, setShowTrail] = useState(true);

  // Mirror UI state to refs so the rAF loop always sees the latest values
  // without having to restart.
  const runningRef = useRef(running);
  const modeRef = useRef(mode);
  const maxVRef = useRef(maxV);
  const wheelTauRef = useRef(wheelTau);
  const showSensorsRef = useRef(showSensors);
  const showTrailRef = useRef(showTrail);
  runningRef.current = running;
  modeRef.current = mode;
  maxVRef.current = maxV;
  wheelTauRef.current = wheelTau;
  showSensorsRef.current = showSensors;
  showTrailRef.current = showTrail;

  // Resize canvas to fit container
  useEffect(() => {
    const el = containerRef.current;
    const c = canvasRef.current;
    if (!el || !c) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = r.width * dpr;
      c.height = r.height * dpr;
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
      c.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (
        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(
          k,
        )
      ) {
        e.preventDefault();
        keysRef.current.add(k);
      }
      if (k === 'r') reset();
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rAF loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      if (runningRef.current) {
        if (modeRef.current === 'manual') {
          const k = keysRef.current;
          const fwd =
            (k.has('w') || k.has('arrowup') ? 1 : 0) -
            (k.has('s') || k.has('arrowdown') ? 1 : 0);
          const turn =
            (k.has('d') || k.has('arrowright') ? 1 : 0) -
            (k.has('a') || k.has('arrowleft') ? 1 : 0);
          const base = fwd * maxVRef.current;
          const diff = turn * maxVRef.current * 0.6;
          s.cmdL = base + diff;
          s.cmdR = base - diff;
        } else {
          const [l, r] = autoControl(s, maxVRef.current);
          s.cmdL = l;
          s.cmdR = r;
        }
        step(s, dt, maxVRef.current, wheelTauRef.current);
      }
      draw();
      frame++;
      if (frame % 6 === 0) force((n) => n + 1); // refresh HUD ~10 Hz
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    stateRef.current = freshState(
      stateRef.current.obstacles.length
        ? stateRef.current.obstacles
        : newObstacles(obstacleCount),
    );
    stateRef.current.bestTime = stateRef.current.bestTime; // preserved
    force((n) => n + 1);
  };
  const randomize = () => {
    stateRef.current = freshState(newObstacles(obstacleCount));
    force((n) => n + 1);
  };

  useAppTools(appId, [
    {
      toolName: 'drive',
      description:
        'Command the robot wheels (m/s). Pass left and right wheel speeds. Switches mode to manual.',
      input_schema: {
        type: 'object',
        properties: { left: { type: 'number' }, right: { type: 'number' } },
        required: ['left', 'right'],
      },
      handler: ({ left, right }: any) => {
        setMode('manual');
        stateRef.current.cmdL = Number(left);
        stateRef.current.cmdR = Number(right);
        return { ok: true };
      },
    },
    {
      toolName: 'reset_robot',
      description: 'Reset the robot to the start with the current obstacles.',
      input_schema: { type: 'object', properties: {} },
      handler: () => {
        reset();
        return { ok: true };
      },
    },
    {
      toolName: 'get_pose',
      description:
        'Return current pose and sensor readings: { x, y, theta, vL, vR, sensors, reached, time }.',
      input_schema: { type: 'object', properties: {} },
      handler: () => {
        const s = stateRef.current;
        return {
          x: s.x,
          y: s.y,
          theta: s.theta,
          vL: s.vL,
          vR: s.vR,
          sensors: s.sensors,
          reached: s.reached,
          time: (performance.now() - s.startTime) / 1000,
        };
      },
    },
    {
      toolName: 'set_auto',
      description: 'Enable or disable the built-in obstacle-avoidance autopilot.',
      input_schema: {
        type: 'object',
        properties: { on: { type: 'string' } },
        required: ['on'],
      },
      handler: ({ on }: any) => {
        setMode(String(on) === 'true' ? 'auto' : 'manual');
        return { ok: true };
      },
    },
  ]);

  useEffect(() => {
    return publishAppState(appId, () => {
      const s = stateRef.current;
      return {
        summary: `RobotSim — pose (${s.x.toFixed(2)}, ${s.y.toFixed(2)}) m, heading ${((s.theta * 180) / Math.PI).toFixed(0)}°, wheels (${s.vL.toFixed(2)}, ${s.vR.toFixed(2)}) m/s, sensors [${s.sensors.map((v) => v.toFixed(2)).join(', ')}] m. Mode: ${mode}. ${s.reached ? 'Goal reached.' : 'En route to goal.'}`,
        state: {
          mode,
          pose: { x: s.x, y: s.y, theta: s.theta },
          wheels: { vL: s.vL, vR: s.vR },
          sensors: s.sensors,
          reached: s.reached,
          bestTime: s.bestTime,
        },
      };
    });
  }, [appId, mode]);

  function draw() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const r = c.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, r.height);
    bg.addColorStop(0, '#0f172a');
    bg.addColorStop(1, '#020617');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, r.width, r.height);

    // Fit arena into the viewport with margins
    const pad = 16;
    const sx = (r.width - 2 * pad) / ARENA_W;
    const sy = (r.height - 2 * pad) / ARENA_H;
    const scale = Math.min(sx, sy);
    const ox = (r.width - ARENA_W * scale) / 2;
    const oy = (r.height - ARENA_H * scale) / 2;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.lineWidth = 1 / scale;

    // Arena floor
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    for (let x = 0; x <= ARENA_W; x++) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ARENA_H);
    }
    for (let y = 0; y <= ARENA_H; y++) {
      ctx.moveTo(0, y);
      ctx.lineTo(ARENA_W, y);
    }
    ctx.stroke();

    // Arena border
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3 / scale;
    ctx.strokeRect(0, 0, ARENA_W, ARENA_H);
    ctx.lineWidth = 1 / scale;

    const s = stateRef.current;

    // Obstacles
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#1f2937';
    for (const o of s.obstacles) {
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeRect(o.x, o.y, o.w, o.h);
    }

    // Goal
    ctx.save();
    ctx.translate(s.goal.x, s.goal.y);
    ctx.fillStyle = s.reached ? '#22c55e' : 'rgba(34,197,94,0.35)';
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2 / scale;
    ctx.beginPath();
    ctx.arc(0, 0, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 0.12, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();
    ctx.restore();

    // Trail
    if (showTrailRef.current && s.trail.length > 4) {
      ctx.strokeStyle = 'rgba(34,211,238,0.55)';
      ctx.lineWidth = 1.6 / scale;
      ctx.beginPath();
      ctx.moveTo(s.trail[0], s.trail[1]);
      for (let i = 2; i < s.trail.length; i += 2)
        ctx.lineTo(s.trail[i], s.trail[i + 1]);
      ctx.stroke();
    }

    // Sensors
    if (showSensorsRef.current) {
      for (let i = 0; i < SENSOR_ANGLES.length; i++) {
        const a = s.theta + SENSOR_ANGLES[i];
        const d = s.sensors[i];
        ctx.strokeStyle =
          d < 0.5 ? 'rgba(239,68,68,0.85)' : 'rgba(250,204,21,0.65)';
        ctx.lineWidth = 1.2 / scale;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d);
        ctx.stroke();
      }
    }

    // Robot
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.theta);
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#0c4a6e';
    ctx.lineWidth = 2 / scale;
    ctx.beginPath();
    ctx.arc(0, 0, ROBOT_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // wheels
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-0.06, -WHEEL_BASE / 2 - 0.04, 0.12, 0.06);
    ctx.fillRect(-0.06, WHEEL_BASE / 2 - 0.02, 0.12, 0.06);
    // heading marker
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.5 / scale;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ROBOT_R + 0.05, 0);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  const s = stateRef.current;
  const speed = (s.vL + s.vR) / 2;
  const headingDeg = ((s.theta * 180) / Math.PI + 360) % 360;
  const elapsed = (performance.now() - s.startTime) / 1000;

  return (
    <div className="flex flex-col h-full">
      <div className="h-9 flex items-center gap-1 px-2 border-b border-white/10 chrome">
        <button
          onClick={() => setRunning((v) => !v)}
          className="flex items-center gap-1 px-2 h-6 rounded-md text-xs bg-accent hover:bg-accent-hover text-white"
        >
          {running ? <Pause size={12} /> : <Play size={12} />}
          {running ? 'Pause' : 'Run'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
          title="Reset robot to the start"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <button
          onClick={randomize}
          className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
          title="Generate a fresh obstacle layout"
        >
          <Shuffle size={12} /> Shuffle
        </button>
        <div className="ml-1 flex items-center bg-white/5 rounded-md p-0.5">
          {(['manual', 'auto'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-1 px-2 h-5 rounded text-[11px] ${
                mode === m
                  ? 'bg-accent text-white'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              {m === 'manual' ? <Keyboard size={11} /> : <Cpu size={11} />}
              {m}
            </button>
          ))}
        </div>
        <label className="ml-2 flex items-center gap-1 text-[11px] text-white/65">
          <input
            type="checkbox"
            checked={showSensors}
            onChange={(e) => setShowSensors(e.target.checked)}
          />
          sensors
        </label>
        <label className="flex items-center gap-1 text-[11px] text-white/65">
          <input
            type="checkbox"
            checked={showTrail}
            onChange={(e) => setShowTrail(e.target.checked)}
          />
          trail
        </label>
        <div className="ml-auto text-[10px] text-white/45 font-mono hidden md:block">
          WASD or arrows to drive · R to reset
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div ref={containerRef} className="flex-1 relative min-w-0">
          <canvas ref={canvasRef} className="absolute inset-0 block" />
        </div>
        <div className="w-56 shrink-0 border-l border-white/10 bg-black/25 chrome flex flex-col">
          <div className="p-3 border-b border-white/10 space-y-2">
            <div className="text-[10px] uppercase text-white/45">Tuning</div>
            <SliderRow
              label="Max v"
              value={maxV}
              min={0.5}
              max={5}
              step={0.1}
              onChange={setMaxV}
              suffix="m/s"
            />
            <SliderRow
              label="Wheel τ"
              value={wheelTau}
              min={0.02}
              max={0.6}
              step={0.02}
              onChange={setWheelTau}
              suffix="s"
            />
            <SliderRow
              label="Obstacles"
              value={obstacleCount}
              min={0}
              max={14}
              step={1}
              onChange={(v) => setObstacleCount(Math.round(v))}
              suffix=""
              integer
            />
          </div>
          <div className="p-3 border-b border-white/10 space-y-1 text-[11px] font-mono">
            <div className="text-[10px] uppercase text-white/45 font-sans">
              Telemetry
            </div>
            <Row k="x" v={`${s.x.toFixed(2)} m`} />
            <Row k="y" v={`${s.y.toFixed(2)} m`} />
            <Row k="heading" v={`${headingDeg.toFixed(0)}°`} />
            <Row k="speed" v={`${speed.toFixed(2)} m/s`} />
            <Row k="ω" v={`${(((s.vR - s.vL) / WHEEL_BASE) * 180 / Math.PI).toFixed(0)}°/s`} />
            <Row k="vL" v={`${s.vL.toFixed(2)}`} />
            <Row k="vR" v={`${s.vR.toFixed(2)}`} />
            <Row k="travel" v={`${s.distance.toFixed(2)} m`} />
          </div>
          <div className="p-3 border-b border-white/10 space-y-1 text-[11px] font-mono">
            <div className="flex items-center gap-1 text-[10px] uppercase text-white/45 font-sans">
              <Gauge size={11} /> Range sensors
            </div>
            {s.sensors.map((d, i) => (
              <SensorBar
                key={i}
                label={['L', 'C', 'R'][i]}
                value={d}
                max={SENSOR_RANGE}
              />
            ))}
          </div>
          <div className="p-3 space-y-1 text-[11px] font-mono">
            <div className="flex items-center gap-1 text-[10px] uppercase text-white/45 font-sans">
              <Target size={11} /> Mission
            </div>
            <Row k="time" v={`${elapsed.toFixed(2)} s`} />
            <Row
              k="best"
              v={s.bestTime === null ? '—' : `${s.bestTime.toFixed(2)} s`}
            />
            <div
              className={`mt-1 text-center py-1 rounded-md text-[11px] ${
                s.reached
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-white/5 text-white/60'
              }`}
            >
              {s.reached ? '✓ Goal reached' : 'Drive to the green flag'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-white/55">{k}</span>
      <span className="text-white">{v}</span>
    </div>
  );
}

function SensorBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const color = value < 0.5 ? '#ef4444' : value < 1.2 ? '#f59e0b' : '#22c55e';
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 text-white/55">{label}</span>
      <div className="flex-1 h-2 bg-white/10 rounded">
        <div
          className="h-2 rounded"
          style={{ width: `${pct * 100}%`, background: color }}
        />
      </div>
      <span className="w-12 text-right">{value.toFixed(2)} m</span>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
  integer,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix: string;
  integer?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-white/65">
      <span className="w-14">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1"
      />
      <span className="w-14 text-right font-mono text-white/80">
        {integer ? value.toFixed(0) : value.toFixed(2)} {suffix}
      </span>
    </label>
  );
}

const module: AppModule = {
  manifest: {
    id: 'robotsim',
    name: 'RobotSim',
    description:
      'Top-down differential-drive robot — manual driving, autopilot, range sensors',
    icon: Bot,
    defaultSize: { width: 1080, height: 680 },
    accent: 'linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%)',
  },
  Component: RobotSim,
};

export default module;
