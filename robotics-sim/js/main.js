// ═══════════════════════════════════════════════════════════════════════
//  main.js — RoboDrive Simulator bootstrap & render loop
//  Three.js r160 + Cannon-es 0.20 + custom modules
// ═══════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PhysicsWorld }  from './Physics.js';
import { Controls }      from './Controls.js';
import { Robot }         from './Robot.js';
import { Field }         from './Field.js';
import { GameManager }   from './GameManager.js';
import { DriverStation } from './DriverStation.js';

// ── Loading progress ───────────────────────────────────────────────────
const ld    = document.getElementById('loading-screen');
const ldBar = document.getElementById('ld-bar');
const ldSts = document.getElementById('ld-status');
let   ldPct = 0;
function loadStep(pct, text) {
    ldPct = pct;
    ldBar.style.width = pct + '%';
    ldSts.textContent = text;
}

// ── Three.js scene setup ───────────────────────────────────────────────
loadStep(10, 'Initialising renderer…');
const canvas   = document.getElementById('main-canvas');
const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.outputColorSpace  = THREE.SRGBColorSpace;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 500);
camera.position.set(0, 8, 12);
camera.lookAt(0, 0, 0);

// Orbit controls (used in orbit mode)
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.minDistance   = 2;
orbit.maxDistance   = 40;
orbit.maxPolarAngle = Math.PI * 0.48;

// ── Physics world ──────────────────────────────────────────────────────
loadStep(25, 'Building physics world…');
const pw = new PhysicsWorld();

// ── Game systems ───────────────────────────────────────────────────────
loadStep(40, 'Loading field geometry…');
const field = new Field(scene, pw);

loadStep(58, 'Assembling robot…');
const robot = new Robot(scene, pw);

loadStep(72, 'Configuring game manager…');
const game = new GameManager();
game.setToastEl(document.getElementById('toast'));

loadStep(85, 'Wiring driver station…');
const controls = new Controls();
const ds       = new DriverStation(robot, game, field, camera);

// ── Minimap setup ──────────────────────────────────────────────────────
const minimapCanvas = document.getElementById('minimap');
const mmCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
const MM_W  = minimapCanvas ? minimapCanvas.width  : 160;
const MM_H  = minimapCanvas ? minimapCanvas.height : 100;
const FIELD_W = 16.5, FIELD_D = 8.2;

function worldToMM(wx, wz) {
    return {
        x: ((wx + FIELD_W/2) / FIELD_W) * MM_W,
        y: ((wz + FIELD_D/2) / FIELD_D) * MM_H,
    };
}

function drawMinimap() {
    if (!mmCtx) return;
    mmCtx.clearRect(0, 0, MM_W, MM_H);

    // Field background
    mmCtx.fillStyle = '#0d1220';
    mmCtx.fillRect(0, 0, MM_W, MM_H);

    // Alliance zones
    mmCtx.fillStyle = 'rgba(204,34,34,0.18)';
    mmCtx.fillRect(0, 0, MM_W * 0.22, MM_H);
    mmCtx.fillStyle = 'rgba(34,68,204,0.18)';
    mmCtx.fillRect(MM_W * 0.78, 0, MM_W * 0.22, MM_H);

    // Center line
    mmCtx.strokeStyle = '#2244aa';
    mmCtx.lineWidth = 1;
    mmCtx.beginPath(); mmCtx.moveTo(MM_W/2, 0); mmCtx.lineTo(MM_W/2, MM_H); mmCtx.stroke();

    // Game pieces
    for (const p of field.gamePieces) {
        const pt = worldToMM(p.body.position.x, p.body.position.z);
        mmCtx.fillStyle = p.type === 'cone' ? '#ff8c00' : '#9955ff';
        mmCtx.beginPath();
        mmCtx.arc(pt.x, pt.y, p.scored ? 1.5 : 2.5, 0, Math.PI * 2);
        mmCtx.fill();
    }

    // Scoring nodes
    for (const node of field.nodes) {
        const pt = worldToMM(node.x, node.z);
        mmCtx.fillStyle = node.scored
            ? '#00ff88'
            : (node.alliance === 'red' ? '#cc3333' : '#3355cc');
        mmCtx.beginPath();
        mmCtx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        mmCtx.fill();
    }

    // Robot
    if (robot.body) {
        const rp = worldToMM(robot.body.position.x, robot.body.position.z);
        const yaw = robot.yaw;
        mmCtx.save();
        mmCtx.translate(rp.x, rp.y);
        mmCtx.rotate(-yaw);
        mmCtx.fillStyle = '#00e5c0';
        mmCtx.fillRect(-5, -3.5, 10, 7);
        // Direction arrow
        mmCtx.fillStyle = '#ffffff';
        mmCtx.beginPath();
        mmCtx.moveTo(5, 0); mmCtx.lineTo(2, -2.5); mmCtx.lineTo(2, 2.5);
        mmCtx.closePath(); mmCtx.fill();
        mmCtx.restore();
    }
}

// ── Camera modes ───────────────────────────────────────────────────────
const CHASE_OFFSET   = new THREE.Vector3(0, 2.8, -5.5);
const FPV_OFFSET     = new THREE.Vector3(0, 0.32, 0.22);
const OVERHEAD_POS   = new THREE.Vector3(0, 18, 0);

let   chaseYaw = 0;
const _tmpQ    = new THREE.Quaternion();
const _tmpV    = new THREE.Vector3();

function updateCamera(mode) {
    if (!robot.body) return;
    const rp  = robot.body.position;
    const ryaw = robot.yaw;

    if (mode === 0) {
        // Orbit — orbit target follows robot
        orbit.target.lerp(
            new THREE.Vector3(rp.x, rp.y + 0.2, rp.z), 0.05
        );
        orbit.update();

    } else if (mode === 1) {
        // Chase cam
        const desiredOffset = CHASE_OFFSET.clone()
            .applyQuaternion(new THREE.Quaternion().setFromEuler(
                new THREE.Euler(0, ryaw, 0)));
        const desired = new THREE.Vector3(
            rp.x + desiredOffset.x,
            rp.y + desiredOffset.y,
            rp.z + desiredOffset.z
        );
        camera.position.lerp(desired, 0.1);
        camera.lookAt(rp.x, rp.y + 0.5, rp.z);

    } else if (mode === 2) {
        // First-person (robot cab)
        const fpv = FPV_OFFSET.clone().applyQuaternion(
            new THREE.Quaternion(
                robot.body.quaternion.x, robot.body.quaternion.y,
                robot.body.quaternion.z, robot.body.quaternion.w
            ));
        camera.position.set(rp.x + fpv.x, rp.y + fpv.y, rp.z + fpv.z);
        const lookDir = new THREE.Vector3(
            -Math.sin(ryaw), -0.05, -Math.cos(ryaw));
        camera.lookAt(
            camera.position.x + lookDir.x,
            camera.position.y + lookDir.y,
            camera.position.z + lookDir.z
        );

    } else {
        // Overhead
        camera.position.lerp(
            new THREE.Vector3(rp.x, OVERHEAD_POS.y, rp.z), 0.06
        );
        camera.lookAt(rp.x, 0, rp.z);
    }
}

// ── Resize handling ────────────────────────────────────────────────────
function onResize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
new ResizeObserver(onResize).observe(canvas);

// ── Finish loading and kick off loop ──────────────────────────────────
loadStep(100, 'Ready!');
setTimeout(() => { ld.classList.add('hidden'); }, 600);

// ── Animate ────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    // Input
    controls.update();
    const input = controls.getState();

    // Physics step (fixed 120 Hz, max 4 substeps)
    pw.step(1 / 120, dt, 4);

    // Simulation
    const camYaw = Math.atan2(
        camera.position.x - (robot.body?.position.x || 0),
        camera.position.z - (robot.body?.position.z || 0)
    );
    robot.update(dt, input, camYaw);
    field.update(dt);
    game.update(dt);

    // Piece pickup / release / scoring
    if (robot.enabled) {
        const clawPos = robot.getClawWorldPos();
        if (input.intake) game.tryPickup(field.gamePieces, clawPos, false);
        if (input.clawOpen && game.heldPieces.length > 0) {
            game.tryScore(field, clawPos);
        }
        game.updateHeldPieces(clawPos);
    }

    // Camera
    const camMode = ds.camMode;
    orbit.enabled = (camMode === 0);
    updateCamera(camMode);

    // DS UI
    ds.update();

    // Minimap
    drawMinimap();

    // Render
    renderer.render(scene, camera);
}

animate();
