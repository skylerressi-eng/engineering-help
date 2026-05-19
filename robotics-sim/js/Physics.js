// ═══════════════════════════════════════════════════════════════════════
//  Physics.js — Cannon-es world wrapper (Gazebo-style rigid-body sandbox)
// ═══════════════════════════════════════════════════════════════════════
import * as CANNON from 'cannon-es';

export { CANNON };

export class PhysicsWorld {
    constructor() {
        this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.allowSleep = true;
        this.world.solver.iterations = 12;
        this.world.defaultContactMaterial.friction = 0.4;
        this.world.defaultContactMaterial.restitution = 0.15;

        // Named materials so we can tune surface interactions
        this.materials = {
            ground: new CANNON.Material('ground'),
            wheel:  new CANNON.Material('wheel'),
            robot:  new CANNON.Material('robot'),
            piece:  new CANNON.Material('piece'),
            wall:   new CANNON.Material('wall'),
        };

        this._contact(this.materials.wheel,  this.materials.ground, 0.9,  0.05);
        this._contact(this.materials.robot,  this.materials.ground, 0.35, 0.1);
        this._contact(this.materials.piece,  this.materials.ground, 0.4,  0.45);
        this._contact(this.materials.piece,  this.materials.robot,  0.3,  0.3);
        this._contact(this.materials.robot,  this.materials.wall,   0.1,  0.3);
        this._contact(this.materials.piece,  this.materials.wall,   0.2,  0.5);

        this._links = []; // { body, mesh }
    }

    _contact(a, b, friction, restitution) {
        this.world.addContactMaterial(
            new CANNON.ContactMaterial(a, b, { friction, restitution })
        );
    }

    /** Register a body and (optionally) keep a three.js mesh synced to it. */
    add(body, mesh = null) {
        this.world.addBody(body);
        if (mesh) this._links.push({ body, mesh });
        return body;
    }

    remove(body) {
        this.world.removeBody(body);
        this._links = this._links.filter(l => l.body !== body);
    }

    /** Raycast helper — returns hit distance along `dir` (unit) or maxDist. */
    ray(from, dir, maxDist = 12) {
        const to = new CANNON.Vec3(
            from.x + dir.x * maxDist,
            from.y + dir.y * maxDist,
            from.z + dir.z * maxDist
        );
        const result = new CANNON.RaycastResult();
        this.world.raycastClosest(
            new CANNON.Vec3(from.x, from.y, from.z), to,
            { skipBackfaces: true }, result
        );
        return result.hasHit ? result.distance : maxDist;
    }

    step(fixedStep, dt, maxSub) {
        this.world.step(fixedStep, dt, maxSub);
        for (const { body, mesh } of this._links) {
            mesh.position.set(body.position.x, body.position.y, body.position.z);
            mesh.quaternion.set(
                body.quaternion.x, body.quaternion.y,
                body.quaternion.z, body.quaternion.w
            );
        }
    }
}
