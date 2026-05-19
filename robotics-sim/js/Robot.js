// ═══════════════════════════════════════════════════════════════════════
//  Robot.js — 3D robot with mecanum drive, articulated arm, claw, sensors
//  Inspired by FRC/FTC build conventions and ROS 2 URDF layout
// ═══════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const DEG = Math.PI / 180;

// ── Reusable geometry/material helpers ────────────────────────────────
const geo  = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl  = (r, h, seg = 20) => new THREE.CylinderGeometry(r, r, h, seg);

function mat(hex, opts = {}) {
    return new THREE.MeshStandardMaterial({ color: hex, ...opts });
}

// ── Build a single mecanum wheel mesh ─────────────────────────────────
function buildWheel(color) {
    const g = new THREE.Group();
    // Hub
    const hub = new THREE.Mesh(cyl(0.045, 0.07, 16), mat(0x303030));
    hub.rotation.z = Math.PI / 2;
    g.add(hub);
    // Rollers around rim — gives the classic mecanum look
    const rollerMat = mat(color);
    const rollerGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.09, 8);
    for (let i = 0; i < 12; i++) {
        const a  = (i / 12) * Math.PI * 2;
        const r  = new THREE.Mesh(rollerGeo, rollerMat);
        r.position.set(0, Math.cos(a) * 0.065, Math.sin(a) * 0.065);
        r.rotation.z = Math.PI / 2;
        r.rotation.y = 45 * DEG + (i % 2 === 0 ? 0 : Math.PI);
        g.add(r);
    }
    // Rim ring
    const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.065, 0.008, 8, 16),
        mat(0x222222)
    );
    rim.rotation.y = Math.PI / 2;
    g.add(rim);
    return g;
}

// ══════════════════════════════════════════════════════════════════════
export class Robot {
    constructor(scene, physicsWorld) {
        this.scene  = scene;
        this.pw     = physicsWorld;
        this.world  = physicsWorld.world;
        this.mats   = physicsWorld.materials;

        // State
        this.enabled     = false;
        this.driveMode   = 'field';   // 'field' | 'robot' | 'tank'
        this.speed       = 0.7;       // 0..1 multiplier from DS slider
        this.turbo       = false;

        this.armPitch    = 0;        // radians, -45..90
        this.armExtend   = 0;        // 0..1
        this.clawOpen    = false;
        this.intakeOn    = false;
        this.heldPiece   = null;

        this.mesh        = new THREE.Group();
        this.wheelMeshes = [];
        this.wheelSpin   = [0, 0, 0, 0];

        this.sensors     = { front: 0, left: 0, right: 0, back: 0 };
        this.batteryV    = 12.5;
        this._battDrain  = 0;

        this._build();
    }

    // ── Build the full robot mesh + physics body ───────────────────────
    _build() {
        /* ── Chassis ── */
        const chassisMat = mat(0x1a4d9c, { metalness: 0.6, roughness: 0.35 });
        const chassis = new THREE.Mesh(geo(0.60, 0.10, 0.70), chassisMat);
        chassis.castShadow = true;
        chassis.receiveShadow = true;
        this.mesh.add(chassis);

        // Bumper rails (red or blue set by DS)
        const bumperFront = new THREE.Mesh(geo(0.64, 0.06, 0.04), mat(0xcc2222));
        bumperFront.position.set(0, -0.02, 0.37);
        this.mesh.add(bumperFront);
        const bumperBack  = bumperFront.clone();
        bumperBack.position.z = -0.37;
        this.mesh.add(bumperBack);
        const bumperL = new THREE.Mesh(geo(0.04, 0.06, 0.66), mat(0xcc2222));
        bumperL.position.set(-0.32, -0.02, 0);
        this.mesh.add(bumperL);
        const bumperR = bumperL.clone();
        bumperR.position.x = 0.32;
        this.mesh.add(bumperR);
        this.bumpers = [bumperFront, bumperBack, bumperL, bumperR];

        // Battery box
        const bat = new THREE.Mesh(geo(0.15, 0.09, 0.18), mat(0x111111, { metalness: 0.2 }));
        bat.position.set(-0.18, 0.095, -0.12);
        this.mesh.add(bat);
        const batLabel = new THREE.Mesh(geo(0.13, 0.01, 0.10), mat(0xffcc00));
        batLabel.position.set(-0.18, 0.15, -0.12);
        this.mesh.add(batLabel);

        // Electronics board
        const board = new THREE.Mesh(geo(0.38, 0.02, 0.30), mat(0x0a3a0a, { metalness: 0.3 }));
        board.position.set(0.05, 0.06, -0.05);
        this.mesh.add(board);
        // RoboRIO (grey box)
        const rio = new THREE.Mesh(geo(0.14, 0.035, 0.08), mat(0x888888, { metalness: 0.5 }));
        rio.position.set(0.05, 0.09, -0.05);
        this.mesh.add(rio);

        /* ── Wheels ── */
        const WX = 0.33, WZ = 0.24;
        const wheelPos = [
            [ WX, -0.035,  WZ],  // FL
            [-WX, -0.035,  WZ],  // FR
            [ WX, -0.035, -WZ],  // BL
            [-WX, -0.035, -WZ],  // BR
        ];
        const colors = [0x44aaff, 0x44aaff, 0x44aaff, 0x44aaff];
        for (let i = 0; i < 4; i++) {
            const w = buildWheel(colors[i]);
            w.position.set(...wheelPos[i]);
            this.mesh.add(w);
            this.wheelMeshes.push(w);
        }

        /* ── Arm assembly ── */
        this.armPivot = new THREE.Group();
        this.armPivot.position.set(0, 0.09, 0.25);
        this.mesh.add(this.armPivot);

        // Arm tower / shoulder
        const tower = new THREE.Mesh(geo(0.06, 0.22, 0.06), mat(0x335577, { metalness: 0.7 }));
        tower.position.set(0, 0.11, 0);
        this.armPivot.add(tower);

        // Shoulder joint
        const shoulderJoint = new THREE.Mesh(cyl(0.04, 0.09, 12), mat(0x555555, { metalness: 0.8 }));
        shoulderJoint.rotation.z = Math.PI / 2;
        shoulderJoint.position.set(0, 0.22, 0);
        this.armPivot.add(shoulderJoint);

        // Upper arm
        this.armUpper = new THREE.Group();
        this.armUpper.position.set(0, 0.22, 0);
        this.armPivot.add(this.armUpper);

        const upperLink = new THREE.Mesh(geo(0.04, 0.35, 0.04), mat(0x3a6dad, { metalness: 0.6 }));
        upperLink.position.set(0, 0.175, 0);
        this.armUpper.add(upperLink);

        // Elbow joint
        const elbowJoint = new THREE.Mesh(cyl(0.033, 0.07, 12), mat(0x555555, { metalness: 0.8 }));
        elbowJoint.rotation.z = Math.PI / 2;
        elbowJoint.position.set(0, 0.35, 0);
        this.armUpper.add(elbowJoint);

        // Forearm / extension
        this.armForearm = new THREE.Group();
        this.armForearm.position.set(0, 0.35, 0);
        this.armUpper.add(this.armForearm);

        this.forearmMesh = new THREE.Mesh(geo(0.03, 0.28, 0.03), mat(0x2255aa, { metalness: 0.5 }));
        this.forearmMesh.position.set(0, 0.14, 0);
        this.armForearm.add(this.forearmMesh);

        // Wrist
        const wrist = new THREE.Mesh(cyl(0.025, 0.055, 12), mat(0x444444, { metalness: 0.9 }));
        wrist.rotation.z = Math.PI / 2;
        wrist.position.set(0, 0.28, 0);
        this.armForearm.add(wrist);

        // Claw base
        this.clawBase = new THREE.Group();
        this.clawBase.position.set(0, 0.28, 0);
        this.armForearm.add(this.clawBase);

        const clawBody = new THREE.Mesh(geo(0.09, 0.04, 0.09), mat(0x1a1a1a, { metalness: 0.7 }));
        this.clawBase.add(clawBody);

        // Two claw fingers
        this.fingerL = new THREE.Mesh(geo(0.025, 0.12, 0.02), mat(0xdddddd, { metalness: 0.8 }));
        this.fingerL.position.set(-0.035, -0.06, 0.055);
        this.clawBase.add(this.fingerL);

        this.fingerR = this.fingerL.clone();
        this.fingerR.position.x = 0.035;
        this.clawBase.add(this.fingerR);

        // Intake roller on claw
        const intake = new THREE.Mesh(cyl(0.018, 0.12, 12), mat(0xff8800));
        intake.rotation.x = Math.PI / 2;
        intake.position.set(0, -0.025, 0.06);
        this.clawBase.add(intake);
        this.intakeRoller = intake;

        /* ── Camera mast ── */
        const mast = new THREE.Mesh(geo(0.015, 0.18, 0.015), mat(0x888888));
        mast.position.set(0, 0.22, 0.2);
        this.mesh.add(mast);
        const camBox = new THREE.Mesh(geo(0.055, 0.04, 0.035), mat(0x111111));
        camBox.position.set(0, 0.32, 0.205);
        this.mesh.add(camBox);
        const lens = new THREE.Mesh(cyl(0.012, 0.02, 8), mat(0x2244aa, { emissive: 0x001133 }));
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 0.32, 0.225);
        this.mesh.add(lens);
        this.cameraMast = camBox;

        /* ── 3D position helper arrows ── */
        const arrow = new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.2, 0),
            0.35, 0x00ff88, 0.08, 0.05
        );
        this.mesh.add(arrow);

        /* ── Physics body ── */
        const shape = new CANNON.Box(new CANNON.Vec3(0.30, 0.09, 0.35));
        this.body = new CANNON.Body({ mass: 55, material: this.mats.robot, linearDamping: 0.6, angularDamping: 0.9 });
        this.body.addShape(shape, new CANNON.Vec3(0, -0.01, 0));
        this.body.position.set(0, 0.135, 0);
        this.body.allowSleep = false;
        this.pw.add(this.body, null); // mesh sync done manually (arm causes offset)

        this.mesh.castShadow    = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);
    }

    // ── Called each frame ──────────────────────────────────────────────
    update(dt, input, cameraYaw) {
        this._syncMeshToBody();
        this._updateDrive(dt, input, cameraYaw);
        this._updateArm(dt, input);
        this._updateClaw(input);
        this._updateIntake(dt, input);
        this._updateSensors();
        this._updateWheelSpin(dt, input);
        this._updateBattery(dt, input);
    }

    _syncMeshToBody() {
        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);
    }

    _updateDrive(dt, input, camYaw) {
        if (!this.enabled) return;
        let { forward, strafe, rotate } = input;
        const spd = this.speed * (input.boost ? 2.2 : 1.0);

        let wx = strafe, wz = -forward;
        // Field-centric: rotate drive vector by camera yaw
        if (this.driveMode === 'field') {
            const c = Math.cos(camYaw), s = Math.sin(camYaw);
            const rx = wx * c - wz * s;
            const rz = wx * s + wz * c;
            wx = rx; wz = rz;
        }

        const maxV = 4.5 * spd;
        const vel  = this.body.velocity;
        const q    = this.body.quaternion;

        // Express desired velocity in world space
        const fwdWorld = new CANNON.Vec3(-Math.sin(this._yaw()), 0, -Math.cos(this._yaw()));
        const rgtWorld = new CANNON.Vec3( Math.cos(this._yaw()), 0, -Math.sin(this._yaw()));

        const desX = (fwdWorld.x * wz + rgtWorld.x * wx) * maxV;
        const desZ = (fwdWorld.z * wz + rgtWorld.z * wx) * maxV;

        const acc = 28 * spd;
        this.body.velocity.x += (desX - vel.x) * acc * dt;
        this.body.velocity.z += (desZ - vel.z) * acc * dt;
        // Keep grounded
        this.body.velocity.y = Math.min(this.body.velocity.y, 0.5);

        // Yaw
        this.body.angularVelocity.y += rotate * 3.5 * spd - this.body.angularVelocity.y * 0.4;
    }

    _yaw() {
        const q = this.body.quaternion;
        return Math.atan2(2*(q.w*q.y + q.x*q.z), 1 - 2*(q.y*q.y + q.z*q.z));
    }

    _updateArm(dt, input) {
        // Shoulder pitch
        const pitchRate = 1.4 * dt;
        this.armPitch = Math.max(-0.4, Math.min(Math.PI * 0.55,
            this.armPitch + input.armAngle * pitchRate));
        this.armUpper.rotation.x = -this.armPitch;

        // Extension
        const extRate = 0.9 * dt;
        this.armExtend = Math.max(0, Math.min(1,
            this.armExtend + input.armExtend * extRate));
        const extraY = this.armExtend * 0.22;
        this.forearmMesh.scale.y = 1 + this.armExtend * 0.75;
        this.forearmMesh.position.y = (0.14 + extraY);
        this.clawBase.position.y = 0.28 + extraY * 1.6;
    }

    _updateClaw(input) {
        const target = input.clawOpen ? 0.065 : 0.022;
        const rate   = 0.12;
        const curX   = this.fingerL.position.x;
        this.fingerL.position.x += (-(Math.abs(target)) - curX) * rate;
        this.fingerR.position.x += ( (Math.abs(target)) - this.fingerR.position.x) * rate;
        this.clawOpen = input.clawOpen;
    }

    _updateIntake(dt, input) {
        this.intakeOn = input.intake;
        if (this.intakeOn) {
            this.intakeRoller.rotation.x += 15 * dt;
        }
    }

    _updateSensors() {
        const pos = new CANNON.Vec3(
            this.body.position.x, this.body.position.y, this.body.position.z);
        const yaw = this._yaw();
        const dirs = {
            front: new CANNON.Vec3(-Math.sin(yaw),           0, -Math.cos(yaw)),
            back:  new CANNON.Vec3( Math.sin(yaw),           0,  Math.cos(yaw)),
            left:  new CANNON.Vec3(-Math.cos(yaw),           0,  Math.sin(yaw)),
            right: new CANNON.Vec3( Math.cos(yaw),           0, -Math.sin(yaw)),
        };
        for (const [k, d] of Object.entries(dirs)) {
            this.sensors[k] = this.pw.ray(pos, d, 4.0);
        }
    }

    _updateWheelSpin(dt, input) {
        const { forward, strafe, rotate } = input;
        const spins = [
            forward + strafe + rotate,
            forward - strafe - rotate,
            forward - strafe + rotate,
            forward + strafe - rotate,
        ];
        for (let i = 0; i < 4; i++) {
            this.wheelSpin[i] += spins[i] * 18 * dt;
            this.wheelMeshes[i].children[0].rotation.x = this.wheelSpin[i];
        }
    }

    _updateBattery(dt, input) {
        const load = Math.abs(input.forward) + Math.abs(input.strafe)
                   + Math.abs(input.rotate)  + Math.abs(input.armAngle)
                   + Math.abs(input.armExtend);
        this._battDrain += load * 0.0004 * dt;
        this.batteryV = Math.max(6, 12.5 - this._battDrain);
    }

    // ── Public helpers ─────────────────────────────────────────────────
    reset(x = 0, z = 0, yawDeg = 0) {
        this.body.position.set(x, 0.14, z);
        const q = new CANNON.Quaternion();
        q.setFromEuler(0, yawDeg * DEG, 0);
        this.body.quaternion.copy(q);
        this.body.velocity.setZero();
        this.body.angularVelocity.setZero();
        this.armPitch   = 0;
        this.armExtend  = 0;
        this._battDrain = 0;
        this.batteryV   = 12.5;
    }

    setAlliance(alliance) {
        const color = alliance === 'red' ? 0xcc2222 : 0x2244cc;
        this.bumpers.forEach(b => b.material.color.setHex(color));
    }

    get worldPosition() { return this.mesh.position; }
    get yaw()           { return this._yaw(); }

    getClawWorldPos() {
        const v = new THREE.Vector3();
        this.clawBase.getWorldPosition(v);
        return v;
    }
}
