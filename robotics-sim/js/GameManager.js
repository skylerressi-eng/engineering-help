// ═══════════════════════════════════════════════════════════════════════
//  GameManager.js — Match timing, scoring, piece pickup, toasts
// ═══════════════════════════════════════════════════════════════════════

export class GameManager {
    constructor() {
        this.phase        = 'teleop'; // 'auto' | 'teleop' | 'endgame'
        this.phaseDuration = { auto: 15, teleop: 135, endgame: 30 };
        this.timeLeft     = this.phaseDuration[this.phase];
        this.running      = false;
        this.scores       = { red: 0, blue: 0 };
        this.alliance     = 'red';
        this.log          = [];
        this.heldPieces   = [];
        this.maxHeld      = 2;

        this._toastTimeout = null;
        this._toastEl      = null;
        this._toastCb      = null;
    }

    setToastEl(el)  { this._toastEl = el; }
    onToast(cb)     { this._toastCb = cb; }

    startMatch() {
        this.timeLeft = this.phaseDuration[this.phase];
        this.running  = true;
        this._logEntry(`Match started — ${this.phase.toUpperCase()}`, 'warn');
    }

    stopMatch()  { this.running = false; }
    resetMatch() {
        this.timeLeft = this.phaseDuration[this.phase];
        this.running  = false;
        this.scores   = { red: 0, blue: 0 };
        this.heldPieces = [];
        this.log      = [];
    }

    setPhase(phase) {
        this.phase    = phase;
        this.timeLeft = this.phaseDuration[phase];
    }

    update(dt) {
        if (!this.running) return;
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        if (this.timeLeft === 0) {
            this.running = false;
            this._logEntry('Time expired!', 'warn');
            this._showToast('TIME!');
        }
    }

    // ── Piece interaction ─────────────────────────────────────────────
    tryPickup(gamePieces, clawWorldPos, clawOpen) {
        if (clawOpen)                          return false;
        if (this.heldPieces.length >= this.maxHeld) return false;

        for (const p of gamePieces) {
            if (p.scored) continue;
            const dx = p.body.position.x - clawWorldPos.x;
            const dy = p.body.position.y - clawWorldPos.y;
            const dz = p.body.position.z - clawWorldPos.z;
            if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 0.28) {
                this.heldPieces.push(p);
                p.body.mass = 0;
                p.body.updateMassProperties();
                p.body.type = 2; // KINEMATIC
                this._logEntry(`Picked up ${p.type}`, 'score');
                this._showToast(`INTAKE: ${p.type.toUpperCase()}`);
                return true;
            }
        }
        return false;
    }

    releaseAll() {
        for (const p of this.heldPieces) {
            p.body.type = 1;
            p.body.mass = p.type === 'cone' ? 0.6 : 0.8;
            p.body.updateMassProperties();
        }
        this.heldPieces = [];
    }

    updateHeldPieces(clawWorldPos) {
        for (let i = 0; i < this.heldPieces.length; i++) {
            const p = this.heldPieces[i];
            const offset = i * 0.16;
            p.body.position.set(
                clawWorldPos.x,
                clawWorldPos.y + offset,
                clawWorldPos.z
            );
            p.body.velocity.setZero();
            p.body.angularVelocity.setZero();
        }
    }

    tryScore(field, clawWorldPos) {
        if (this.heldPieces.length === 0) return;
        const result = field.checkScoring(clawWorldPos, this.heldPieces[0]);
        if (result) {
            const alliancePts = result.alliance === 'red' ? 'red' : 'blue';
            this.scores[alliancePts] += result.points;
            this.heldPieces[0].scored = true;
            this.heldPieces[0].body.mass = 0;
            this.heldPieces.shift();
            const msg = `+${result.points} pts (${result.type})`;
            this._logEntry(msg, 'score');
            this._showToast(msg);
        }
    }

    // ── Penalties & bonuses ───────────────────────────────────────────
    addPoints(alliance, pts, reason = '') {
        this.scores[alliance] += pts;
        this._logEntry(`+${pts} ${alliance} — ${reason}`, 'score');
    }

    applyPenalty(alliance, pts = 5) {
        const opp = alliance === 'red' ? 'blue' : 'red';
        this.scores[opp] += pts;
        this._logEntry(`FOUL ${alliance}: +${pts} to ${opp}`, 'warn');
    }

    // ── UI helpers ────────────────────────────────────────────────────
    _logEntry(text, type = '') {
        this.log.push({ text, type, ts: Date.now() });
        if (this.log.length > 40) this.log.shift();
        if (this._toastCb) this._toastCb({ text, type });
    }

    _showToast(text) {
        if (!this._toastEl) return;
        this._toastEl.textContent = text;
        this._toastEl.className = 'toast show';
        clearTimeout(this._toastTimeout);
        this._toastTimeout = setTimeout(() => {
            if (this._toastEl) this._toastEl.className = 'toast';
        }, 2200);
    }

    get formattedTime() {
        const t = Math.ceil(this.timeLeft);
        const m = Math.floor(t / 60);
        const s = t % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}
