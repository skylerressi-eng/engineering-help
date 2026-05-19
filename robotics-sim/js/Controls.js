// ═══════════════════════════════════════════════════════════════════════
//  Controls.js — Keyboard + Gamepad input (driver controls)
// ═══════════════════════════════════════════════════════════════════════
export class Controls {
    constructor() {
        this.keys = {};
        this._clawLatch = false;
        this._clawPrev  = false;
        this._gpClawPrev = false;

        this.state = {
            forward: 0, strafe: 0, rotate: 0,
            armAngle: 0, armExtend: 0,
            clawOpen: false, boost: false, intake: false,
        };

        window.addEventListener('keydown', e => {
            this.keys[e.code] = true;
            // Stop arrow keys / space scrolling the page
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab']
                .includes(e.code)) e.preventDefault();
        });
        window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    }

    update() {
        const k = this.keys;
        let forward = 0, strafe = 0, rotate = 0, armAngle = 0, armExtend = 0;

        // ── Drive base
        if (k['KeyW']) forward += 1;
        if (k['KeyS']) forward -= 1;
        if (k['KeyD']) strafe  += 1;
        if (k['KeyA']) strafe  -= 1;
        if (k['KeyQ']) rotate  += 1;
        if (k['KeyE']) rotate  -= 1;

        // ── Arm
        if (k['ArrowUp'])    armAngle  += 1;
        if (k['ArrowDown'])  armAngle  -= 1;
        if (k['ArrowRight']) armExtend += 1;
        if (k['ArrowLeft'])  armExtend -= 1;

        // ── Claw toggle (rising edge)
        const clawKey = !!k['Space'];
        if (clawKey && !this._clawPrev) this._clawLatch = !this._clawLatch;
        this._clawPrev = clawKey;

        // ── Gamepad (Xbox layout) overrides if sticks are pushed
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = pads && pads[0];
        if (gp) {
            const dz = v => (Math.abs(v) > 0.12 ? v : 0);
            forward  += -dz(gp.axes[1]);
            strafe   +=  dz(gp.axes[0]);
            rotate   +=  dz(gp.axes[2]);
            armAngle += -dz(gp.axes[3]);
            armExtend += (gp.buttons[7]?.value || 0) - (gp.buttons[6]?.value || 0);
            const a = gp.buttons[0]?.pressed;
            if (a && !this._gpClawPrev) this._clawLatch = !this._clawLatch;
            this._gpClawPrev = a;
        }

        // Clamp / normalise translation
        const mag = Math.hypot(forward, strafe);
        if (mag > 1) { forward /= mag; strafe /= mag; }

        const clamp = v => Math.max(-1, Math.min(1, v));
        this.state = {
            forward:   clamp(forward),
            strafe:    clamp(strafe),
            rotate:    clamp(rotate),
            armAngle:  clamp(armAngle),
            armExtend: clamp(armExtend),
            clawOpen:  this._clawLatch,
            boost:     !!(k['ShiftLeft'] || k['ShiftRight']),
            intake:    !!(k['KeyX'] || (gp && gp.buttons[1]?.pressed)),
        };
    }

    getState() { return this.state; }
}
