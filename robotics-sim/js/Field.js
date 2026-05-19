// ═══════════════════════════════════════════════════════════════════════
//  Field.js — 3D competition field (FRC CRESCENDO-style layout)
//  Includes: field tiles, walls, game pieces, scoring nodes, charge station
// ═══════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const DEG = Math.PI / 180;

function box(w, h, d, hex, opts = {}) {
    const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: hex, ...opts })
    );
    m.castShadow = m.receiveShadow = true;
    return m;
}

// ═══════════════════════════════════════════════════════════════════════
export class Field {
    constructor(scene, physicsWorld) {
        this.scene = scene;
        this.pw    = physicsWorld;
        this.world = physicsWorld.world;
        this.mats  = physicsWorld.materials;

        this.gamePieces  = [];
        this.nodes       = [];
        this.scoredNodes = new Set();
        this.layout      = 'frc';

        this._group = new THREE.Group();
        scene.add(this._group);

        this._buildField();
        this._buildLighting();
    }

    _buildField() {
        this._clearDynamic();
        if (this.layout === 'frc') this._buildFRC();
        else if (this.layout === 'ftc') this._buildFTC();
        else this._buildGazebo();
    }

    // ── FRC Crescendo-style field ──────────────────────────────────────
    _buildFRC() {
        const FW = 16.5, FD = 8.2, WALL = 0.15, WH = 0.80;

        /* ─ Ground tile grid ─ */
        const tileGeo = new THREE.PlaneGeometry(FW + 0.3, FD + 0.3);
        const tileMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a2e, roughness: 0.95, metalness: 0.0,
        });
        const floor = new THREE.Mesh(tileGeo, tileMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this._group.add(floor);

        // Tile stripe lines (field markings)
        const lineMat = new THREE.LineBasicMaterial({ color: 0x334466 });
        for (let x = -7; x <= 7; x++) {
            const pts = [new THREE.Vector3(x, 0.002, -FD/2),
                         new THREE.Vector3(x, 0.002,  FD/2)];
            this._group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
        }
        for (let z = -3; z <= 3; z++) {
            const pts = [new THREE.Vector3(-FW/2, 0.002, z),
                         new THREE.Vector3( FW/2, 0.002, z)];
            this._group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
        }

        // Center line (bold)
        const cLineMat = new THREE.LineBasicMaterial({ color: 0x44aaff, linewidth: 2 });
        const cPts = [new THREE.Vector3(0, 0.003, -FD/2), new THREE.Vector3(0, 0.003, FD/2)];
        this._group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cPts), cLineMat));

        /* ─ Alliance zones ─ */
        const zoneGeo = new THREE.PlaneGeometry(3.6, FD);
        const redZone = new THREE.Mesh(zoneGeo,
            new THREE.MeshStandardMaterial({ color: 0xff2233, transparent: true, opacity: 0.08 }));
        redZone.rotation.x = -Math.PI / 2;
        redZone.position.set(-FW/2 + 1.8, 0.001, 0);
        this._group.add(redZone);
        const blueZone = redZone.clone();
        blueZone.material = new THREE.MeshStandardMaterial({ color: 0x2244ff, transparent: true, opacity: 0.08 });
        blueZone.position.x = FW/2 - 1.8;
        this._group.add(blueZone);

        /* ─ Perimeter walls ─ */
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x334466, metalness: 0.4, roughness: 0.7 });
        const wallPieces = [
            { w: FW + WALL*2, h: WH, d: WALL, x: 0,      z:  FD/2 + WALL/2 },
            { w: FW + WALL*2, h: WH, d: WALL, x: 0,      z: -FD/2 - WALL/2 },
            { w: WALL,        h: WH, d: FD,   x:  FW/2 + WALL/2, z: 0 },
            { w: WALL,        h: WH, d: FD,   x: -FW/2 - WALL/2, z: 0 },
        ];
        for (const p of wallPieces) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), wallMat);
            m.position.set(p.x, p.h / 2, p.z);
            m.castShadow = m.receiveShadow = true;
            this._group.add(m);
            // Physics
            const b = new CANNON.Body({ mass: 0, material: this.mats.wall });
            b.addShape(new CANNON.Box(new CANNON.Vec3(p.w/2, p.h/2, p.d/2)));
            b.position.set(p.x, p.h/2, p.z);
            this.world.addBody(b);
        }

        /* ─ Ground physics ─ */
        const gnd = new CANNON.Body({ mass: 0, material: this.mats.ground });
        gnd.addShape(new CANNON.Plane());
        gnd.quaternion.setFromEuler(-Math.PI/2, 0, 0);
        this.world.addBody(gnd);

        /* ─ Charge Station (FRC ramp) ─ */
        this._buildChargeStation();

        /* ─ Community Grid scoring nodes ─ */
        this._buildScoringGrid(-FW/2 + 2.1, 'red');
        this._buildScoringGrid( FW/2 - 2.1, 'blue');

        /* ─ Game pieces ─ */
        this._spawnGamePieces();
    }

    _buildChargeStation() {
        // Two side ramps + flat top
        const rampMat = new THREE.MeshStandardMaterial({ color: 0x2a3a5c, metalness: 0.5, roughness: 0.4 });
        const platform = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 2.0), rampMat);
        platform.position.set(0, 0.09, 0);
        platform.castShadow = platform.receiveShadow = true;
        this._group.add(platform);

        // Checkerboard tread texture procedurally
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext('2d');
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            ctx.fillStyle = (x + y) % 2 === 0 ? '#1a2a4a' : '#2a4a7a';
            ctx.fillRect(x*8, y*8, 8, 8);
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.repeat.set(3, 3); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        platform.material.map = tex;

        // Ramps
        const rampGeo = new THREE.BoxGeometry(2.4, 0.02, 0.85);
        for (const side of [-1, 1]) {
            const ramp = new THREE.Mesh(rampGeo, rampMat.clone());
            ramp.position.set(0, 0.14, side * 1.42);
            ramp.rotation.x = side * 12 * DEG;
            ramp.castShadow = true;
            this._group.add(ramp);
        }

        // Physics box for platform
        const pb = new CANNON.Body({ mass: 0, material: this.mats.ground });
        pb.addShape(new CANNON.Box(new CANNON.Vec3(1.2, 0.09, 1.0)));
        pb.position.set(0, 0.09, 0);
        this.world.addBody(pb);
    }

    _buildScoringGrid(xCenter, alliance) {
        const color = alliance === 'red' ? 0xcc3333 : 0x3355cc;
        const poleColor = alliance === 'red' ? 0xaa2222 : 0x2244aa;
        const rows = 3, cols = 3;
        const xSpacing = 0.56, zSpacing = 0.7;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = xCenter;
                const z = (col - 1) * zSpacing;
                const height = [0.40, 0.70, 1.05][row];

                // Node pole
                const pole = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.025, 0.025, height, 8),
                    new THREE.MeshStandardMaterial({ color: poleColor, metalness: 0.7 })
                );
                pole.position.set(x, height / 2, z);
                pole.castShadow = true;
                this._group.add(pole);

                // Node cup
                const nodeType = row === 2 ? 'high' : row === 1 ? 'mid' : 'low';
                const cupR = 0.07;
                const cup = new THREE.Mesh(
                    new THREE.CylinderGeometry(cupR, cupR * 0.7, 0.06, 12, 1, true),
                    new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, metalness: 0.5 })
                );
                cup.position.set(x, height + 0.03, z);
                this._group.add(cup);

                const nodeData = { mesh: cup, alliance, type: nodeType, x, y: height + 0.03, z, scored: false };
                this.nodes.push(nodeData);
            }
        }
    }

    _spawnGamePieces() {
        // Cones (orange triangular shape)
        const conePos = [
            [-4.0,  2.5], [-4.0, 0], [-4.0, -2.5],
            [ 4.0,  2.5], [ 4.0, 0], [ 4.0, -2.5],
            [-2.0,  1.0], [-2.0, -1.0],
            [ 2.0,  1.0], [ 2.0, -1.0],
        ];
        for (const [x, z] of conePos) this._spawnCone(x, z);

        // Cubes (purple)
        const cubePos = [
            [-5.5,  1.3], [-5.5, -1.3],
            [ 5.5,  1.3], [ 5.5, -1.3],
            [-3.0,  0],   [ 3.0, 0],
        ];
        for (const [x, z] of cubePos) this._spawnCube(x, z);
    }

    _spawnCone(x, z) {
        const mesh = new THREE.Mesh(
            new THREE.ConeGeometry(0.055, 0.22, 12),
            new THREE.MeshStandardMaterial({ color: 0xff8c00, roughness: 0.5 })
        );
        mesh.position.set(x, 0.11, z);
        mesh.castShadow = true;
        this._group.add(mesh);

        const body = new CANNON.Body({ mass: 0.6, material: this.mats.piece, linearDamping: 0.35, angularDamping: 0.7 });
        body.addShape(new CANNON.Cylinder(0.01, 0.055, 0.22, 8));
        body.position.set(x, 0.13, z);
        this.pw.add(body, mesh);

        this.gamePieces.push({ mesh, body, type: 'cone', scored: false, _startX: x, _startZ: z });
    }

    _spawnCube(x, z) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.14, 0.14, 0.14),
            new THREE.MeshStandardMaterial({ color: 0x9955ff, roughness: 0.4, metalness: 0.1 })
        );
        mesh.position.set(x, 0.07, z);
        mesh.castShadow = true;
        this._group.add(mesh);

        const body = new CANNON.Body({ mass: 0.8, material: this.mats.piece, linearDamping: 0.4, angularDamping: 0.7 });
        body.addShape(new CANNON.Box(new CANNON.Vec3(0.07, 0.07, 0.07)));
        body.position.set(x, 0.08, z);
        this.pw.add(body, mesh);

        this.gamePieces.push({ mesh, body, type: 'cube', scored: false, _startX: x, _startZ: z });
    }

    // ── FTC field ─────────────────────────────────────────────────────
    _buildFTC() {
        this._buildSimpleFloor(3.66, 3.66, 0x1a2a1a);
        this._buildSimpleWalls(3.66, 3.66, 0.6, 0.025);

        // FTC-style pixels / tiles
        const colors = [0xffaa00, 0x22aaff, 0x22dd44, 0xff44aa];
        const pixelPositions = [
            [-1.0,  0.8], [ 0.0,  0.8], [ 1.0,  0.8],
            [-1.0,  0.0], [ 0.0,  0.0], [ 1.0,  0.0],
            [-1.0, -0.8], [ 0.0, -0.8], [ 1.0, -0.8],
        ];
        for (let i = 0; i < pixelPositions.length; i++) {
            const [x, z] = pixelPositions[i];
            const col = colors[i % colors.length];
            this._spawnCube(x, z);
        }
        this._buildScoringGrid(-1.5, 'red');
        this._buildScoringGrid( 1.5, 'blue');
        this._groundPhysics();
    }

    // ── Open Gazebo-style sandbox field ───────────────────────────────
    _buildGazebo() {
        this._buildSimpleFloor(20, 20, 0x2a2a2a);
        this._buildSimpleWalls(20, 20, 1.0, 0.1);

        // Obstacle course elements
        this._addObstacle(-4, -4, 1.2, 0.6, 1.2, 0x556655);
        this._addObstacle( 4, -4, 0.4, 1.4, 0.4, 0x556655);
        this._addObstacle( 4,  4, 1.8, 0.3, 0.4, 0x556655);
        this._addObstacle(-4,  4, 0.6, 0.9, 1.6, 0x556655);
        this._addRamp( 2,  2, 2.0, 0.5, 1.2);
        this._addRamp(-2, -2, 2.0, 0.5, 1.2);

        // Scatter pieces
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            this._spawnCone(Math.cos(a) * 3.5, Math.sin(a) * 3.5);
        }
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + 0.3;
            this._spawnCube(Math.cos(a) * 5, Math.sin(a) * 5);
        }
        this._groundPhysics();
    }

    _addObstacle(x, z, w, h, d, color) {
        const m = box(w, h, d, color, { roughness: 0.8 });
        m.position.set(x, h / 2, z);
        this._group.add(m);
        const b = new CANNON.Body({ mass: 0, material: this.mats.wall });
        b.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)));
        b.position.set(x, h/2, z);
        this.world.addBody(b);
    }

    _addRamp(x, z, w, h, d) {
        const m = box(w, h, d, 0x3a5a3a, { roughness: 0.6 });
        m.position.set(x, h / 2, z);
        m.rotation.x = 18 * DEG;
        this._group.add(m);
        const b = new CANNON.Body({ mass: 0, material: this.mats.ground });
        b.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)));
        b.position.set(x, h/2, z);
        b.quaternion.setFromEuler(18 * DEG, 0, 0);
        this.world.addBody(b);
    }

    _buildSimpleFloor(w, d, color) {
        const m = new THREE.Mesh(
            new THREE.PlaneGeometry(w, d),
            new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
        );
        m.rotation.x = -Math.PI / 2;
        m.receiveShadow = true;
        this._group.add(m);
        this._groundPhysics();
    }

    _buildSimpleWalls(fw, fd, wh, wt) {
        const wm = new THREE.MeshStandardMaterial({ color: 0x445566, metalness: 0.3, roughness: 0.7 });
        const walls = [
            { w: fw, h: wh, d: wt, x: 0,      z:  fd/2 },
            { w: fw, h: wh, d: wt, x: 0,      z: -fd/2 },
            { w: wt, h: wh, d: fd, x:  fw/2,  z: 0 },
            { w: wt, h: wh, d: fd, x: -fw/2,  z: 0 },
        ];
        for (const p of walls) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), wm);
            m.position.set(p.x, p.h/2, p.z);
            m.castShadow = m.receiveShadow = true;
            this._group.add(m);
            const b = new CANNON.Body({ mass: 0, material: this.mats.wall });
            b.addShape(new CANNON.Box(new CANNON.Vec3(p.w/2, p.h/2, p.d/2)));
            b.position.set(p.x, p.h/2, p.z);
            this.world.addBody(b);
        }
    }

    _groundPhysics() {
        const g = new CANNON.Body({ mass: 0, material: this.mats.ground });
        g.addShape(new CANNON.Plane());
        g.quaternion.setFromEuler(-Math.PI/2, 0, 0);
        this.world.addBody(g);
    }

    // ── Lighting ──────────────────────────────────────────────────────
    _buildLighting() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.35);
        this.scene.add(ambient);

        // Main overhead array (stadium lights)
        const lightPositions = [
            [-6, 9, -3], [6, 9, -3], [-6, 9, 3], [6, 9, 3], [0, 10, 0]
        ];
        for (const [x, y, z] of lightPositions) {
            const spot = new THREE.SpotLight(0xfff5e8, 1.6, 28, 0.55, 0.3, 1.2);
            spot.position.set(x, y, z);
            spot.castShadow = true;
            spot.shadow.mapSize.set(1024, 1024);
            spot.shadow.camera.near = 0.5;
            spot.shadow.camera.far  = 30;
            this.scene.add(spot, spot.target);
        }

        // Alliance-colored fills
        const redFill  = new THREE.PointLight(0xff2233, 0.5, 10);
        redFill.position.set(-7, 2, 0);
        this.scene.add(redFill);
        const blueFill = new THREE.PointLight(0x2244ff, 0.5, 10);
        blueFill.position.set( 7, 2, 0);
        this.scene.add(blueFill);

        // Sky dome
        this.scene.background = new THREE.Color(0x0a0e17);
        this.scene.fog = new THREE.FogExp2(0x0a0e17, 0.025);
    }

    // ── Per-frame ─────────────────────────────────────────────────────
    update(dt) {
        // Animate scored nodes (pulsing glow)
        for (const node of this.nodes) {
            if (node.scored) {
                node.mesh.material.emissiveIntensity =
                    0.5 + 0.5 * Math.sin(Date.now() * 0.004);
            }
        }
        // Piece out-of-bounds recovery
        for (const p of this.gamePieces) {
            if (p.body.position.y < -2) {
                p.body.position.set(p._startX, 0.15, p._startZ);
                p.body.velocity.setZero();
                p.body.angularVelocity.setZero();
            }
        }
    }

    // ── Layout switch ─────────────────────────────────────────────────
    switchLayout(name) {
        // Clear old pieces / physics bodies
        this._clearAll();
        this.layout = name;
        this._buildField();
    }

    _clearDynamic() {
        for (const p of this.gamePieces) {
            this._group.remove(p.mesh);
            this.pw.remove(p.body);
        }
        this.gamePieces = [];
        this.nodes = [];
        this.scoredNodes.clear();
    }

    _clearAll() {
        this._clearDynamic();
        while (this._group.children.length) {
            const c = this._group.children[0];
            this._group.remove(c);
            if (c.geometry) c.geometry.dispose();
        }
        // Remove all static physics bodies (keep dynamic robot body)
        const toRemove = [];
        for (const b of this.world.bodies) {
            if (b.mass === 0) toRemove.push(b);
        }
        toRemove.forEach(b => this.world.removeBody(b));
    }

    // ── Scoring check ─────────────────────────────────────────────────
    checkScoring(clawWorldPos, heldPiece) {
        if (!heldPiece) return null;
        for (const node of this.nodes) {
            if (node.scored) continue;
            const dx = clawWorldPos.x - node.x;
            const dy = clawWorldPos.y - node.y;
            const dz = clawWorldPos.z - node.z;
            if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 0.4) {
                node.scored = true;
                node.mesh.material.emissive = new THREE.Color(0x00ff88);
                node.mesh.material.emissiveIntensity = 0.8;
                const pts = node.type === 'high' ? 5 : node.type === 'mid' ? 3 : 2;
                return { alliance: node.alliance, points: pts, type: node.type };
            }
        }
        return null;
    }
}
