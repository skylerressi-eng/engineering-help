import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Gauge, Zap } from 'lucide-react';
import { RoboIcon } from '@/apps/icons';
import type { AppModule } from '@/os/types';
import {
  useRoboStore,
  type DrivetrainId,
  type FieldId,
  type CameraMode,
  type MatchPhase,
} from '@/store/robosimStore';
import { DRIVE_PRESETS } from './physics';
import {
  robot,
  rawInput,
  pieces,
  resetRobot,
  loadPieces,
  keyHandlers,
  FIELD_BOUNDS,
  DEPOSIT_ZONES,
} from './shared';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';
import { toast } from '@/store/toastStore';
import Viewport from './Viewport';

const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'KeyR',
]);

interface Telemetry {
  speed: number;
  heading: number;
  x: number;
  z: number;
  rpm: number;
  current: number;
  voltage: number;
  slip: boolean;
}

function RoboSim({ appId }: { appId: string }) {
  const st = useRoboStore();
  const rootRef = useRef<HTMLDivElement>(null);
  const [gamepadActive, setGamepadActive] = useState(false);
  const [tel, setTel] = useState<Telemetry>({
    speed: 0,
    heading: 0,
    x: 0,
    z: 0,
    rpm: 0,
    current: 0,
    voltage: 12.6,
    slip: false,
  });

  /* ---- keyboard ---- */
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (GAME_KEYS.has(e.code)) {
        e.preventDefault();
        if (e.code === 'KeyR') {
          const f = FIELD_BOUNDS[useRoboStore.getState().field];
          resetRobot(0, -(f.halfZ - 1), 0);
          return;
        }
        keyHandlers.down(e.code);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (GAME_KEYS.has(e.code)) keyHandlers.up(e.code);
    };
    const blur = () => keyHandlers.clear();
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      keyHandlers.clear();
    };
  }, []);

  /* ---- match clock + gameplay + telemetry (single rAF) ---- */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let gpWasActive = false;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      // Gamepad: only write to rawInput when no keyboard key is held
      const gp = navigator.getGamepads?.()[0] ?? null;
      const gpNowActive = !!gp;
      if (gpNowActive !== gpWasActive) {
        gpWasActive = gpNowActive;
        setGamepadActive(gpNowActive);
      }
      if (gp && !keyHandlers.isActive()) {
        const dead = (v: number) => (Math.abs(v) > 0.12 ? v : 0);
        rawInput.drive = -dead(gp.axes[1] ?? 0);
        rawInput.strafe = dead(gp.axes[0] ?? 0);
        rawInput.turn = dead(gp.axes[2] ?? 0);
        rawInput.boost = gp.buttons[5]?.pressed ?? false;
        rawInput.precision = gp.buttons[4]?.pressed ?? false;
        rawInput.intake = gp.buttons[0]?.pressed ?? false;
      } else if (!gp && !keyHandlers.isActive()) {
        // No gamepad and no keys — ensure inputs are zeroed
        rawInput.drive = 0;
        rawInput.strafe = 0;
        rawInput.turn = 0;
      }

      const s = useRoboStore.getState();

      if (s.running) {
        s.tickClock(dt);
        // Pickup: nearest uncollected piece within reach while intaking.
        if (rawInput.intake && s.heldPieces < 2) {
          let bi = -1;
          let bd = 0.55 * 0.55;
          for (let i = 0; i < pieces.length; i++) {
            if (pieces[i].collected) continue;
            const dx = pieces[i].x - robot.x;
            const dz = pieces[i].z - robot.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bd) {
              bd = d2;
              bi = i;
            }
          }
          if (bi >= 0) {
            pieces[bi].collected = true;
            s.setHeld(s.heldPieces + 1);
          }
        }
        // Scoring: enter your alliance zone holding pieces (FRC field).
        if (s.field === 'frc' && s.heldPieces > 0) {
          const f = FIELD_BOUNDS.frc;
          const inRed = robot.x < -f.halfX + 3;
          const inBlue = robot.x > f.halfX - 3;
          if ((s.alliance === 'red' && inRed) || (s.alliance === 'blue' && inBlue)) {
            const pts = s.heldPieces * 2;
            s.addScore(s.alliance, pts, `${s.heldPieces} piece(s)`);
            s.setHeld(0);
          }
        }
        // Scoring: deposit zone for open/obstacle fields.
        if (s.field !== 'frc' && s.heldPieces > 0) {
          const zone = DEPOSIT_ZONES[s.field];
          if (zone) {
            const inZone =
              Math.abs(robot.x - zone.x) < zone.halfW &&
              Math.abs(robot.z - zone.z) < zone.halfD;
            if (inZone) {
              const pts = s.heldPieces * 3;
              s.addScore(s.alliance, pts, `${s.heldPieces}× deposit`);
              s.setHeld(0);
            }
          }
        }
      }

      // throttle HUD to ~20 Hz
      acc += dt;
      if (acc >= 0.05) {
        acc = 0;
        setTel({
          speed: robot.speed,
          heading: (robot.heading * 180) / Math.PI,
          x: robot.x,
          z: robot.z,
          rpm:
            (Math.abs(robot.wheelRpm[0]) +
              Math.abs(robot.wheelRpm[1]) +
              Math.abs(robot.wheelRpm[2]) +
              Math.abs(robot.wheelRpm[3])) /
            4,
          current: robot.motorCurrent,
          voltage: robot.batteryVoltage,
          slip: robot.tractionLimited,
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---- reset robot when field changes ---- */
  useEffect(() => {
    const f = FIELD_BOUNDS[st.field];
    resetRobot(0, -(f.halfZ - 1), 0);
    loadPieces(st.field);
  }, [st.field]);

  /* ---- AI scanner ---- */
  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `RoboSim — ${st.drivetrain} drivetrain, ${
        st.fieldOriented ? 'field-oriented' : 'robot-oriented'
      } mecanum. Match ${st.phase} ${st.running ? 'RUNNING' : 'stopped'} (${st.timeLeft.toFixed(
        0,
      )}s). Speed ${robot.speed.toFixed(2)} m/s, draw ${robot.motorCurrent.toFixed(
        0,
      )} A, battery ${robot.batteryVoltage.toFixed(
        1,
      )} V. Score R${st.scoreRed}–B${st.scoreBlue}.`,
      state: {
        drivetrain: st.drivetrain,
        config: st.config,
        fieldOriented: st.fieldOriented,
        throttle: st.throttle,
        phase: st.phase,
        running: st.running,
        scoreRed: st.scoreRed,
        scoreBlue: st.scoreBlue,
      },
    }));
  }, [appId, st]);

  /* ---- AI tools ---- */
  useAppTools(appId, [
    {
      toolName: 'set_drivetrain',
      description:
        'Choose the drivetrain preset: competition (balanced), sprint (light/fast), or tank (heavy/torquey).',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: ['competition', 'sprint', 'tank'] },
        },
        required: ['id'],
      },
      handler: ({ id }) => {
        useRoboStore.getState().setDrivetrain(id as DrivetrainId);
        return { ok: true };
      },
    },
    {
      toolName: 'set_match',
      description:
        'Control the match: action ∈ {start, stop, reset}. start enables the robot and runs the clock.',
      input_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['start', 'stop', 'reset'] },
        },
        required: ['action'],
      },
      handler: ({ action }) => {
        const s = useRoboStore.getState();
        if (action === 'start') s.startMatch();
        else if (action === 'reset') {
          s.resetMatch();
          loadPieces(s.field);
          const f = FIELD_BOUNDS[s.field];
          resetRobot(0, -(f.halfZ - 1), 0);
        } else useRoboStore.setState({ running: false, enabled: false });
        return { running: useRoboStore.getState().running };
      },
    },
    {
      toolName: 'drive_robot',
      description:
        'Apply a driver command for a duration. drive +fwd/-rev, strafe +right/-left, turn +cw/-ccw, each -1..1; seconds 0.1..5.',
      input_schema: {
        type: 'object',
        properties: {
          drive: { type: 'number' },
          strafe: { type: 'number' },
          turn: { type: 'number' },
          seconds: { type: 'number' },
        },
        required: ['seconds'],
      },
      handler: async ({ drive, strafe, turn, seconds }) => {
        const s = useRoboStore.getState();
        if (!s.running) s.startMatch();
        rawInput.drive = Number(drive ?? 0);
        rawInput.strafe = Number(strafe ?? 0);
        rawInput.turn = Number(turn ?? 0);
        const dur = Math.max(0.1, Math.min(5, Number(seconds)));
        await new Promise((r) => setTimeout(r, dur * 1000));
        rawInput.drive = 0;
        rawInput.strafe = 0;
        rawInput.turn = 0;
        return {
          x: robot.x.toFixed(2),
          z: robot.z.toFixed(2),
          headingDeg: ((robot.heading * 180) / Math.PI).toFixed(1),
          speed: robot.speed.toFixed(2),
        };
      },
    },
    {
      toolName: 'get_telemetry',
      description:
        'Return live robot telemetry: position, heading, speed, wheel RPM, motor current, battery voltage, traction state.',
      input_schema: { type: 'object', properties: {} },
      handler: () => ({
        x: robot.x,
        z: robot.z,
        headingDeg: (robot.heading * 180) / Math.PI,
        speed: robot.speed,
        wheelRpm: robot.wheelRpm,
        motorCurrent: robot.motorCurrent,
        batteryVoltage: robot.batteryVoltage,
        tractionLimited: robot.tractionLimited,
      }),
    },
  ]);

  const time = `${Math.floor(st.timeLeft / 60)}:${String(
    Math.floor(st.timeLeft % 60),
  ).padStart(2, '0')}`;

  return (
    <div ref={rootRef} className="flex h-full">
      {/* Viewport + HUD */}
      <div className="flex-1 relative min-w-0">
        <Viewport />

        {/* Top HUD */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 pointer-events-none">
          <div
            className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider ${
              st.enabled && st.running
                ? 'bg-emerald-500/25 text-emerald-300'
                : 'bg-traffic-red/20 text-traffic-red'
            }`}
          >
            {st.enabled && st.running ? 'ENABLED' : 'DISABLED'}
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 rounded-md glass-strong text-xs font-bold text-traffic-red">
              RED <span className="font-mono text-sm">{st.scoreRed}</span>
            </div>
            <div className="font-mono text-2xl text-white tabular-nums">
              {time}
            </div>
            <div className="px-3 py-1 rounded-md glass-strong text-xs font-bold text-blue-400">
              BLUE <span className="font-mono text-sm">{st.scoreBlue}</span>
            </div>
          </div>
          <div className="px-3 py-1 rounded-full glass-strong text-xs font-bold tracking-wider text-white/80">
            {st.phase.toUpperCase()}
          </div>
        </div>

        {/* Telemetry */}
        <div className="absolute top-2 left-2 mt-9 glass-strong rounded-md px-2.5 py-2 text-[11px] font-mono text-white/85 space-y-0.5 pointer-events-none">
          <Row k="speed" v={`${tel.speed.toFixed(2)} m/s`} />
          <Row k="hdg" v={`${tel.heading.toFixed(0)}°`} />
          <Row k="pos" v={`${tel.x.toFixed(1)}, ${tel.z.toFixed(1)}`} />
          <Row k="rpm" v={tel.rpm.toFixed(0)} />
          <Row
            k="amps"
            v={`${tel.current.toFixed(0)} A`}
            warn={tel.current > 240}
          />
          <Row
            k="batt"
            v={`${tel.voltage.toFixed(1)} V`}
            warn={tel.voltage < 9}
          />
          {gamepadActive && (
            <div className="text-emerald-400">GAMEPAD</div>
          )}
          {tel.slip && (
            <div className="text-amber-400 font-bold">⚠ WHEEL SLIP</div>
          )}
        </div>

        {/* Camera switch */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
          {(['orbit', 'chase', 'fpv', 'overhead'] as CameraMode[]).map((c) => (
            <button
              key={c}
              onClick={() => st.setCamera(c)}
              className={`px-2.5 py-1 rounded-md text-[11px] ${
                st.camera === c
                  ? 'bg-accent text-white'
                  : 'glass-strong text-white/70 hover:text-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Held pieces */}
        <div className="absolute bottom-3 right-3 glass-strong rounded-md px-3 py-2 pointer-events-none">
          <div className="text-[9px] uppercase text-white/55 mb-1">held</div>
          <div className="flex gap-1.5">
            {[0, 1].map((i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full ${
                  i < st.heldPieces
                    ? 'bg-orange-400 shadow-[0_0_8px] shadow-orange-400'
                    : 'border border-white/25'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Driver station */}
      <div className="w-64 shrink-0 border-l border-white/10 bg-black/30 flex flex-col chrome overflow-y-auto">
        <div className="p-3 space-y-3">
          {/* Match control */}
          <Section title="Match">
            <div className="flex gap-1.5">
              <button
                onClick={() =>
                  st.running
                    ? useRoboStore.setState({ running: false })
                    : st.startMatch()
                }
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs bg-accent hover:bg-accent-hover text-white"
              >
                {st.running ? <Pause size={12} /> : <Play size={12} />}
                {st.running ? 'Stop' : 'Start'}
              </button>
              <button
                onClick={() => {
                  st.resetMatch();
                  loadPieces(st.field);
                  const f = FIELD_BOUNDS[st.field];
                  resetRobot(0, -(f.halfZ - 1), 0);
                  toast.success('Match reset', 'Field and robot restored.');
                }}
                className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs bg-white/5 hover:bg-white/10"
              >
                <RotateCcw size={12} /> Reset
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 mt-2">
              {(['auto', 'teleop', 'endgame'] as MatchPhase[]).map((p) => (
                <button
                  key={p}
                  onClick={() => st.setPhase(p)}
                  className={`py-1 rounded-md text-[10px] ${
                    st.phase === p
                      ? 'bg-accent text-white'
                      : 'bg-white/5 hover:bg-white/10 text-white/70'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 mt-2">
              {(['red', 'blue'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => st.setAlliance(a)}
                  className={`flex-1 py-1 rounded-md text-[11px] font-bold ${
                    st.alliance === a
                      ? a === 'red'
                        ? 'bg-traffic-red/30 text-traffic-red'
                        : 'bg-blue-500/30 text-blue-300'
                      : 'bg-white/5 text-white/55 hover:bg-white/10'
                  }`}
                >
                  {a.toUpperCase()}
                </button>
              ))}
            </div>
          </Section>

          {/* Drivetrain */}
          <Section title="Drivetrain">
            <select
              value={st.drivetrain}
              onChange={(e) =>
                st.setDrivetrain(e.target.value as DrivetrainId)
              }
              className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs outline-none"
            >
              {Object.keys(DRIVE_PRESETS).map((k) => (
                <option key={k} value={k} className="bg-zinc-800">
                  {k}
                </option>
              ))}
            </select>
            <label className="flex items-center justify-between text-[11px] text-white/65 mt-2">
              <span>Field-oriented</span>
              <input
                type="checkbox"
                checked={st.fieldOriented}
                onChange={(e) => st.setFieldOriented(e.target.checked)}
              />
            </label>
            <label className="flex items-center justify-between text-[11px] text-white/65 mt-1.5">
              <span>Brake mode</span>
              <input
                type="checkbox"
                checked={st.brakeMode}
                onChange={(e) => st.setBrakeMode(e.target.checked)}
              />
            </label>
            <Slider
              label="Throttle"
              icon={<Gauge size={11} />}
              min={0.1}
              max={1}
              step={0.05}
              value={st.throttle}
              fmt={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={st.setThrottle}
            />
          </Section>

          {/* Tuning */}
          <Section title="Tuning">
            <Slider
              label="Mass"
              min={25}
              max={80}
              step={1}
              value={st.config.mass}
              fmt={(v) => `${v.toFixed(0)} kg`}
              onChange={(v) => st.patchConfig({ mass: v })}
            />
            <Slider
              label="Gear ratio"
              min={4}
              max={20}
              step={0.5}
              value={st.config.gearRatio}
              fmt={(v) => `${v.toFixed(1)}:1`}
              onChange={(v) => st.patchConfig({ gearRatio: v })}
            />
            <Slider
              label="Traction μ"
              min={0.5}
              max={1.4}
              step={0.05}
              value={st.config.mu}
              fmt={(v) => v.toFixed(2)}
              onChange={(v) => st.patchConfig({ mu: v })}
            />
            <Slider
              label="Slew rate"
              icon={<Zap size={11} />}
              min={0.5}
              max={8}
              step={0.25}
              value={st.config.slewRate}
              fmt={(v) => `${v.toFixed(1)}/s`}
              onChange={(v) => st.patchConfig({ slewRate: v })}
            />
          </Section>

          {/* Field */}
          <Section title="Field">
            <div className="grid grid-cols-3 gap-1">
              {(['frc', 'open', 'obstacle'] as FieldId[]).map((f) => (
                <button
                  key={f}
                  onClick={() => st.setField(f)}
                  className={`py-1 rounded-md text-[10px] ${
                    st.field === f
                      ? 'bg-accent text-white'
                      : 'bg-white/5 hover:bg-white/10 text-white/70'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </Section>

          {/* Controls help */}
          <div className="text-[10px] text-white/40 font-mono leading-relaxed border-t border-white/10 pt-2">
            WASD drive · Q/E turn · Shift boost
            <br />
            Ctrl precision · Space intake · R reset
          </div>

          {/* Log */}
          {st.log.length > 0 && (
            <div className="border-t border-white/10 pt-2">
              <div className="text-[10px] uppercase text-white/45 mb-1">
                Scoring log
              </div>
              <div className="space-y-0.5 max-h-28 overflow-y-auto">
                {st.log.map((e, i) => (
                  <div
                    key={i}
                    className="text-[10px] font-mono flex justify-between"
                  >
                    <span
                      className={
                        e.alliance === 'red'
                          ? 'text-traffic-red'
                          : 'text-blue-400'
                      }
                    >
                      +{e.points} {e.node}
                    </span>
                    <span className="text-white/40">
                      {Math.floor(e.t)}s
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-white/45">{k}</span>
      <span className={warn ? 'text-traffic-red' : 'text-accent'}>{v}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-white/45 mb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}

function Slider({
  label,
  icon,
  min,
  max,
  step,
  value,
  fmt,
  onChange,
}: {
  label: string;
  icon?: React.ReactNode;
  min: number;
  max: number;
  step: number;
  value: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[11px] text-white/65 mb-0.5">
        <span className="flex items-center gap-1">
          {icon}
          {label}
        </span>
        <span className="font-mono text-white/85">{fmt(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

const module: AppModule = {
  manifest: {
    id: 'robosim',
    name: 'RoboSim',
    description:
      'Physics-based mecanum robot driving simulator — FRC/FTC/VEX inspired',
    icon: RoboIcon,
    defaultSize: { width: 1100, height: 680 },
    accent: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  },
  Component: RoboSim,
};

export default module;
