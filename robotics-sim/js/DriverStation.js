// ═══════════════════════════════════════════════════════════════════════
//  DriverStation.js — Wires all DS panel UI to simulation state
// ═══════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

export class DriverStation {
    constructor(robot, game, field, camera) {
        this.robot  = robot;
        this.game   = game;
        this.field  = field;
        this.camera = camera;

        this._camMode   = 0; // 0=orbit 1=chase 2=firstPerson 3=overhead
        this._camLabels = ['ORBIT', 'CHASE', 'FPV', 'OVERHEAD'];
        this._logLen    = 0; // how many game.log entries we've rendered

        this._bind();
        this._initRobotCam();

        // Simulate comms/code going green on load
        setTimeout(() => {
            document.getElementById('ind-comms')?.classList.add('enabled');
            document.getElementById('ind-code')?.classList.add('enabled');
        }, 800);
    }

    // ── Wire every panel control ───────────────────────────────────────
    _bind() {
        const $ = id => document.getElementById(id);
        const $$ = sel => document.querySelectorAll(sel);

        // Alliance buttons
        $$('.alliance-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.alliance-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.game.alliance = btn.dataset.alliance;
                this.robot.setAlliance(btn.dataset.alliance);
            });
        });

        // Enable / Disable
        $('btn-enable')?.addEventListener('click', () => {
            this.robot.enabled = true;
            $('btn-enable').classList.add('active-state');
            $('btn-disable').classList.remove('active-state');
            $('hud-mode-pill').textContent = 'ENABLED';
            $('hud-mode-pill').className = 'hud-pill enabled';
        });
        $('btn-disable')?.addEventListener('click', () => {
            this.robot.enabled = false;
            $('btn-disable').classList.add('active-state');
            $('btn-enable').classList.remove('active-state');
            $('hud-mode-pill').textContent = 'DISABLED';
            $('hud-mode-pill').className = 'hud-pill disabled';
        });

        // Match control
        $('btn-start-match')?.addEventListener('click', () => {
            this.game.startMatch();
            $('match-phase-label').textContent = this.game.phase.toUpperCase();
            $('hud-phase-pill').textContent = this.game.phase.toUpperCase();
        });
        $('btn-reset-match')?.addEventListener('click', () => {
            this.game.resetMatch();
            this.robot.reset(0, 0, 0);
            this._logLen = 0;
            document.querySelector('.action-log')?.replaceChildren();
            for (const p of this.field.gamePieces) {
                p.body.position.set(p._startX, 0.15, p._startZ);
                p.body.velocity.setZero();
                p.body.angularVelocity.setZero();
                p.scored = false;
            }
            for (const node of this.field.nodes) {
                node.scored = false;
                node.mesh.material.emissive = new THREE.Color(0x000000);
                node.mesh.material.emissiveIntensity = 0;
            }
        });

        // Phase buttons
        $$('.phase-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.phase-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.game.setPhase(btn.dataset.phase);
                $('match-phase-label').textContent = btn.dataset.phase.toUpperCase();
                $('hud-phase-pill').textContent = btn.dataset.phase.toUpperCase();
            });
        });

        // Drive mode buttons
        $$('.drive-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.drive-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.robot.driveMode = btn.dataset.mode;
            });
        });

        // Speed slider
        $('speed-slider')?.addEventListener('input', e => {
            const v = parseInt(e.target.value) / 100;
            this.robot.speed = v;
            const disp = $('speed-display');
            if (disp) disp.textContent = Math.round(v * 100) + '%';
        });

        // Turn sens slider (purely visual for now)
        $('turn-slider')?.addEventListener('input', e => {
            const disp = $('turn-display');
            if (disp) disp.textContent = e.target.value + '%';
        });

        // Field layout buttons
        $$('.field-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.field-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.field.switchLayout(btn.dataset.field);
                this.robot.reset(0, 0, 0);
                this.game.resetMatch();
                this._logLen = 0;
            });
        });

        // Field-centric toggle
        $('toggle-field-centric')?.addEventListener('change', e => {
            this.robot.driveMode = e.target.checked ? 'field' : 'robot';
        });

        // Camera cycle via keyboard
        document.addEventListener('keydown', e => {
            if (e.code === 'Digit1') this._setCam(0);
            if (e.code === 'Digit2') this._setCam(1);
            if (e.code === 'Digit3') this._setCam(2);
            if (e.code === 'Digit4') this._setCam(3);
            if (e.code === 'KeyC' && !e.ctrlKey) this._nextCam();
            if (e.code === 'KeyR' && !e.ctrlKey) this.robot.reset(0, 0, 0);
            if (e.code === 'KeyF' && !e.ctrlKey) {
                const tog = document.getElementById('toggle-field-centric');
                if (tog) { tog.checked = !tog.checked; tog.dispatchEvent(new Event('change')); }
            }
            if (e.code === 'Tab') {
                e.preventDefault();
                const ds = document.getElementById('driver-station');
                ds?.classList.toggle('collapsed');
            }
        });
    }

    _initRobotCam() {
        this._camCanvas = document.getElementById('robot-camera');
        this._camCtx    = this._camCanvas?.getContext('2d') ?? null;
    }

    _nextCam()    { this._setCam((this._camMode + 1) % 4); }
    _setCam(mode) {
        this._camMode = mode;
        const lbl = document.getElementById('cam-label');
        if (lbl) lbl.textContent = '[ ' + this._camLabels[mode] + ' ]';
    }
    get camMode() { return this._camMode; }

    // ── Per-frame UI update ────────────────────────────────────────────
    update() {
        this._updateTelemetry();
        this._updateScoreboard();
        this._updateMatchTimer();
        this._updateSensors();
        this._updateBattery();
        this._appendNewLog();
        this._updateRobotCam();
        this._updatePieceSlots();
    }

    _updateTelemetry() {
        const r = this.robot;
        if (!r.body) return;
        const v     = r.body.velocity;
        const speed = Math.hypot(v.x, v.z);
        this._setText('tel-x',   r.body.position.x.toFixed(2));
        this._setText('tel-y',   r.body.position.z.toFixed(2));  // field Z → panel Y row
        this._setText('tel-hdg', (r.yaw * 180 / Math.PI).toFixed(1));
        this._setText('tel-spd', speed.toFixed(2));
        this._setText('tel-arm', (r.armPitch * 180 / Math.PI).toFixed(1));
        this._setText('tel-claw', r.clawOpen ? 'OPEN' : 'CLOSED');
        this._setText('tel-bat', r.batteryV.toFixed(1));
        // CPU: fake a realistic-looking load
        this._setText('tel-cpu', Math.round(12 + Math.random() * 6));
    }

    _updateScoreboard() {
        this._setText('red-score',  this.game.scores.red);
        this._setText('blue-score', this.game.scores.blue);
        this._setText('hud-red',    this.game.scores.red);
        this._setText('hud-blue',   this.game.scores.blue);
    }

    _updateMatchTimer() {
        const t = this.game.formattedTime;
        this._setText('match-timer-display', t);
        this._setText('hud-timer', t);
    }

    _updateSensors() {
        const s = this.robot.sensors;
        const maxD = 4.0;
        for (const dir of ['front', 'back', 'left', 'right']) {
            const dist = s[dir] ?? maxD;
            const pct  = Math.round((1 - dist / maxD) * 100);
            const bar  = document.querySelector(`.sen-bar[data-dir="${dir}"] .sen-fill`);
            const val  = document.querySelector(`.sen-val[data-dir="${dir}"]`);
            if (bar) bar.style.width = pct + '%';
            if (val) val.textContent = dist.toFixed(1) + 'm';
        }
    }

    _updateBattery() {
        const v   = this.robot.batteryV;
        const pct = Math.max(0, Math.min(100, ((v - 6) / 6.5) * 100));
        const bar = document.querySelector('.bat-bar-fill');
        if (bar) {
            bar.style.width = pct + '%';
            bar.style.background = pct > 50
                ? 'linear-gradient(90deg,#2bd96a,#5ee88a)'
                : pct > 25
                    ? 'linear-gradient(90deg,#ffd23b,#ffe07a)'
                    : 'linear-gradient(90deg,#ff3b56,#ff6b7a)';
        }
        this._setText('tel-bat', v.toFixed(1));
    }

    _appendNewLog() {
        const el = document.querySelector('.action-log');
        if (!el) return;
        const log = this.game.log;
        while (this._logLen < log.length) {
            const entry = log[this._logLen++];
            const div   = document.createElement('div');
            div.className = 'log-entry ' + (entry.type || '');
            const ts = new Date(entry.ts);
            div.textContent =
                `[${String(ts.getMinutes()).padStart(2,'0')}:${String(ts.getSeconds()).padStart(2,'0')}] ${entry.text}`;
            el.appendChild(div);
            while (el.children.length > 25) el.removeChild(el.firstChild);
            el.scrollTop = el.scrollHeight;
        }
    }

    _updateRobotCam() {
        const ctx = this._camCtx;
        if (!ctx) return;
        const cw = this._camCanvas.width, ch = this._camCanvas.height;
        ctx.clearRect(0, 0, cw, ch);

        // Background
        ctx.fillStyle = '#06090f';
        ctx.fillRect(0, 0, cw, ch);

        // Grid
        ctx.strokeStyle = '#1a2a4a';
        ctx.lineWidth = 0.5;
        for (let i = 1; i < 4; i++) {
            ctx.beginPath(); ctx.moveTo(i * cw/4, 0); ctx.lineTo(i * cw/4, ch); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i * ch/4); ctx.lineTo(cw, i * ch/4); ctx.stroke();
        }

        // Artificial horizon
        const hy = ch * 0.5 + this.robot.armPitch * 25;
        const gradient = ctx.createLinearGradient(0, 0, 0, ch);
        gradient.addColorStop(0, 'rgba(20,60,100,0.5)');
        gradient.addColorStop(hy / ch, 'rgba(20,60,100,0.3)');
        gradient.addColorStop(hy / ch, 'rgba(20,50,20,0.3)');
        gradient.addColorStop(1, 'rgba(20,50,20,0.5)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, cw, ch);

        // Horizon line
        ctx.strokeStyle = '#00e5c0';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(cw, hy); ctx.stroke();

        // Roll tick marks
        ctx.strokeStyle = 'rgba(0,229,192,0.4)';
        ctx.lineWidth = 1;
        for (let i = -6; i <= 6; i++) {
            if (i === 0) continue;
            const y = hy + i * 12;
            const len = Math.abs(i) % 3 === 0 ? 18 : 10;
            ctx.beginPath(); ctx.moveTo(cw/2 - len, y); ctx.lineTo(cw/2 + len, y); ctx.stroke();
        }

        // Crosshair
        ctx.strokeStyle = '#00e5c0';
        ctx.lineWidth = 1.5;
        const cx = cw / 2, cy = ch / 2;
        ctx.beginPath();
        ctx.moveTo(cx - 18, cy); ctx.lineTo(cx - 6, cy);
        ctx.moveTo(cx + 6,  cy); ctx.lineTo(cx + 18, cy);
        ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy - 6);
        ctx.moveTo(cx, cy + 6);  ctx.lineTo(cx, cy + 18);
        ctx.stroke();
        // Center dot
        ctx.fillStyle = '#00e5c0';
        ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI*2); ctx.fill();

        // Sensor readouts
        ctx.fillStyle = 'rgba(0,229,192,0.85)';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`FWD ${this.robot.sensors.front?.toFixed(1) ?? '--'}m`, 4, ch - 18);
        ctx.fillText(`BAK ${this.robot.sensors.back?.toFixed(1)  ?? '--'}m`, 4, ch - 6);
        ctx.textAlign = 'right';
        ctx.fillText(`RGT ${this.robot.sensors.right?.toFixed(1) ?? '--'}m`, cw - 4, ch - 18);
        ctx.fillText(`LFT ${this.robot.sensors.left?.toFixed(1)  ?? '--'}m`, cw - 4, ch - 6);
        ctx.textAlign = 'left';

        // ENABLED / DISABLED overlay
        if (!this.robot.enabled) {
            ctx.fillStyle = 'rgba(255,59,86,0.15)';
            ctx.fillRect(0, 0, cw, ch);
            ctx.fillStyle = 'rgba(255,59,86,0.8)';
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('DISABLED', cw/2, 14);
            ctx.textAlign = 'left';
        }
    }

    _updatePieceSlots() {
        const slots = document.querySelectorAll('.piece-slot');
        slots.forEach((slot, i) => {
            slot.classList.toggle('filled', i < this.game.heldPieces.length);
        });
    }

    _setText(id, val) {
        const el = document.getElementById(id);
        if (el && el.textContent !== String(val)) el.textContent = val;
    }
}
