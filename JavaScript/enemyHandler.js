import { v3, packRGBA, clamp, aimAngles, approachAngle} from "./supportMathFuncs.js";
import { cam, projectiles, enemyShots } from "./main.js";
import { ship } from "./playerShip.js";
import { obstacles } from "./sceneHandler.js";

export const enemies = [];

const despawnBehind = 40;
const spawnAhead = 240;

function shipWorldCenter() {
  const shipWorldBase = v3(cam.x, cam.height, cam.z + ship.toCamDist);
  return v3(
    shipWorldBase.x + ship.pos.x,
    shipWorldBase.y + ship.pos.y,
    shipWorldBase.z + ship.pos.z
  );
}

function hasLineOfSight(from, to) {
    // Simple check: see if any obstacle blocks the line between two points
    const dir = v3(to.x - from.x, to.y - from.y, to.z - from.z);
    const dist = Math.hypot(dir.x, dir.y, dir.z);
    if (dist < 0.01) return true;
    
    const normDir = v3(dir.x / dist, dir.y / dist, dir.z / dist);
    
    // Check each obstacle
    for (const o of obstacles) {
        // Simple AABB ray intersection
        const oMin = v3(o.pos.x - o.half.x, o.pos.y - o.half.y, o.pos.z - o.half.z);
        const oMax = v3(o.pos.x + o.half.x, o.pos.y + o.half.y, o.pos.z + o.half.z);
        
        // Check if line segment intersects this obstacle
        if (rayAABBIntersect(from, to, oMin, oMax)) {
            return false;  // Line of sight blocked
        }
    }
    return true;  // Clear line of sight
}

function rayAABBIntersect(p1, p2, aabbMin, aabbMax) {
    // Check if line segment from p1 to p2 intersects AABB
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    
    let tmin = -Infinity;
    let tmax = Infinity;
    
    // Check x slab
    if (Math.abs(dx) > 0.001) {
        const t1 = (aabbMin.x - p1.x) / dx;
        const t2 = (aabbMax.x - p1.x) / dx;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (p1.x < aabbMin.x || p1.x > aabbMax.x) {
        return false;
    }
    
    // Check y slab
    if (Math.abs(dy) > 0.001) {
        const t1 = (aabbMin.y - p1.y) / dy;
        const t2 = (aabbMax.y - p1.y) / dy;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (p1.y < aabbMin.y || p1.y > aabbMax.y) {
        return false;
    }
    
    // Check z slab
    if (Math.abs(dz) > 0.001) {
        const t1 = (aabbMin.z - p1.z) / dz;
        const t2 = (aabbMax.z - p1.z) / dz;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (p1.z < aabbMin.z || p1.z > aabbMax.z) {
        return false;
    }
    
    return tmin <= tmax && tmax >= 0 && tmin <= 1;
}

function aabbHit(aPos, aHalf, bPos, bHalf) {
  return (
    Math.abs(aPos.x - bPos.x) <= (aHalf.x + bHalf.x) &&
    Math.abs(aPos.y - bPos.y) <= (aHalf.y + bHalf.y) &&
    Math.abs(aPos.z - bPos.z) <= (aHalf.z + bHalf.z)
  );
}

// -------------------- Spawn --------------------

export function spawnTurret(zWorld, cx) {
    // sits on ground
    const w = 5, h = 10, d = 3;
    enemies.push({
        type: "turret",
        pos: v3(cx, 0, zWorld),  // Sit on ground level (y=0)
        yaw: 0,
        pitch: 0,
        roll: 0,
        scale: 1.0,
        sideTilt: 0,
        dmg: 1,
        shotSpeed: 50,
        fireRate: 0.9,  // seconds between shots
        cooldown: 0.3,  // fire sooner on spawn
        vel: v3(0,0,0),
        half: v3(w*0.5, h*0.5, d*0.5),
        hp: 2,
        alive: true,
        fireCooldown: 0.3 + Math.random()*0.3,
        phase: Math.random()*10,
        color: packRGBA(180, 140, 80, 255),
    });
}

export function spawnDrone(zWorld, cx, cy, hh) {
    const w = 3.2, h = 2.2, d = 3.2;
    enemies.push({
        type: "drone",
        pos: v3(
            cx + (Math.random()*2-1) * 6,
            clamp(cy + (Math.random()*2-1) * (hh*0.8), -10, 12),
            zWorld
        ),
        yaw: 0,
        pitch: 0,
        roll: 0,
        scale: 1.0,
        sideTilt: 0,
        dmg: 1,
        shotSpeed: 60,
        fireRate: 0.65,  // seconds between shots
        cooldown: 0.2,  // fire sooner on spawn
        vel: v3(0,0,0),
        half: v3(w*0.5, h*0.5, d*0.5),
        hp: 1,
        alive: true,
        fireCooldown: 0.3 + Math.random()*0.3,
        phase: Math.random()*10,
        color: packRGBA(120, 180, 200, 255),
    });
}

export function updateEnemies(dt, enemyShots, playerShots) {
    const player = shipWorldCenter(); // your existing function

    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];

        // despawn behind camera - turrets disappear quickly, drones sooner
        const despawnDist = (e.type === "turret") ? 15 : 40;
        if (e.pos.z < cam.z - despawnDist) { enemies.splice(i,1); continue; }

        // --- rotate toward player ---
        if (e.type === "turret") {
            // Turrets only rotate on yaw (around Y axis) to face player - stay upright
            // Only consider X and Z position difference (ignore Y height)
            const dx = player.x - e.pos.x;
            const dz = player.z - e.pos.z;
            const targetYaw = Math.atan2(dx, dz);  // Try original axis order
            const turn = 2.8;
            e.yaw = approachAngle(e.yaw, targetYaw, turn * dt);
            // Lock all other rotations - add default pitch to point forward
            e.pitch = -Math.PI * 0.5;  // -90 degrees to point forward correctly
            e.roll = 0;   
            e.sideTilt = 0;  
        } else {
            // Drones track full 3D position
            const ang = aimAngles(e.pos, player);
            const turn = 5.0;
            e.yaw   = approachAngle(e.yaw,   ang.yaw,   turn * dt);
            e.pitch = approachAngle(e.pitch, ang.pitch, turn * dt);
        }

        // --- movement for drones ---
        if (e.type === "drone") {
            // follow player at roughly player speed (match cam speed feel)
            const followStrength = 1.8; // tune
            const maxVel = 30;

            e.vel.x += clamp((player.x - e.pos.x) * followStrength, -maxVel, maxVel) * dt;
            e.vel.y += clamp((player.y - e.pos.y) * followStrength, -maxVel, maxVel) * dt;

            // keep drones near player z (same forward speed as player)
            // easiest: glue them to a fixed z offset relative to camera
            // OR just move them forward at cam speed:
            e.pos.z += cam.speed * dt;

            // damping
            e.vel.x *= Math.pow(0.82, dt*60);
            e.vel.y *= Math.pow(0.82, dt*60);

            e.pos.x += e.vel.x * dt;
            e.pos.y += e.vel.y * dt;

            e.pos.y = clamp(e.pos.y, -10, 12);
        }

        // --- shooting ---
        e.cooldown -= dt;
        if (e.cooldown <= 0) {
            e.cooldown = e.fireRate;

            // shoot if within range and has line of sight
            const dist = Math.hypot(player.x - e.pos.x, player.y - e.pos.y, player.z - e.pos.z);

            if (dist < 150 && hasLineOfSight(e.pos, player)) {
                const dir = dirTo(e.pos, player);
                spawnEnemyShot(e, dir, enemyShots);
            }
        }

        // --- hit by player shots ---
        for (let p = playerShots.length - 1; p >= 0; p--) {
            const shot = playerShots[p];
            if (aabbHit(e.pos, e.half, shot.pos, shot.half)) {
                playerShots.splice(p, 1);
                e.hp -= 1;
                if (e.hp <= 0) {
                    // Award points based on enemy type
                    const pointsValue = (e.type === "turret") ? 50 : 25;
                    ship.Score += pointsValue;
                    enemies.splice(i, 1);
                    break; // enemy is dead, stop checking
                }
            }
        }
    }
}

export function updateEnemyShots(dt, enemyShots) {
    const shipC = shipWorldCenter();
    const shipHalf = v3(2.0, 1.2, 2.5); // same you use for collisions

    for (let i = enemyShots.length - 1; i >= 0; i--) {
        const s = enemyShots[i];
        
        if (!s) continue;  // Safety check in case array was cleared
        if(s.life != null) s.life -= dt;
        if (s.life <= 0) { enemyShots.splice(i,1); continue; }

        s.pos.x += s.vel.x * dt;
        s.pos.y += s.vel.y * dt;
        s.pos.z += s.vel.z * dt;

        // Check collision with obstacles
        let hitObstacle = false;
        for (const o of obstacles) {
            if (aabbHit(s.pos, s.half, o.pos, o.half)) {
                enemyShots.splice(i, 1);
                hitObstacle = true;
                break;
            }
        }
        if (hitObstacle) continue;

        // hit test with player
        if (aabbHit(s.pos, s.half, shipC, shipHalf)) {
            applyDamageToPlayer(s.dmg);  // <-- turret 2, drone 1
            enemyShots.splice(i,1);
        }
    }
}


function spawnEnemyShot(enemy, dir, enemyShots) {
    const speed = enemy.shotSpeed;
    console.log("Enemy shot fired");

    // Calculate yaw and pitch from direction vector
    // The projectile model points forward along +Z at pitch=π/2, yaw=0
    // yaw = rotation around Y axis (horizontal plane)
    // pitch = rotation around X axis (vertical) - offset by π/2 for model orientation
    const yaw = Math.atan2(dir.x, dir.z);
    const horizontalDist = Math.hypot(dir.x, dir.z);
    const pitch = Math.PI * 0.5 + Math.atan2(dir.y, horizontalDist);

    enemyShots.push({
        pos: v3(enemy.pos.x, enemy.pos.y, enemy.pos.z),
        vel: v3(dir.x * speed, dir.y * speed, dir.z * speed),
        half: v3(0.35, 0.35, 0.8),
        color: packRGBA(255, 130, 60, 255),
        life: 3.0,
        dmg: enemy.dmg,
        owner: "enemy",
        // Pose properties for rendering - rotated to face direction
        yaw: yaw,
        pitch: pitch,
        roll: 0,
        scale: 0.1,
        sideTilt: 0
    });
}

function dirTo(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const inv = 1 / (Math.hypot(dx, dy, dz) || 1e-6);
    return v3(dx*inv, dy*inv, dz*inv);
}

export function applyDamageToPlayer(damage) {
    // Import ship at the top if not already done
    ship.Shield -= damage;
    ship.lastDamageTime = 0;  // Reset damage timer for regeneration delay
    //console.log(`Player took ${damage} damage! Shield: ${Math.max(0, ship.Shield)}/${ship.ShieldMax}`);
    
    // Check if player is dead
    if (ship.Shield <= 0) {
        onPlayerDeath();
    }
}

function onPlayerDeath() {
    console.log("Player died! Resetting level...");
    resetLevel();
}

export function resetLevel() {
    // Reset ship state
    ship.pos = v3(0.0, -4.0, 0.0);
    ship.xVel = 0;
    ship.yVel = 0;
    ship.yaw = 0;
    ship.pitch = 0;
    ship.roll = 0;
    ship.sideTilt = 0;
    ship.rollActive = false;
    ship.Score = 0;
    
    // Reset resources
    ship.Shield = ship.ShieldMax;
    ship.Energy = ship.EnergyMax;
    ship.lastDamageTime = -999;
    ship.lastEnergyUseTime = -999;
    
    // Clear projectiles and enemies
    enemies.length = 0;
    projectiles.length = 0;
    enemyShots.length = 0;
    obstacles.length = 0;
    
    // Reset camera and scene
    cam.x = 0;
    cam.z = 0;
    cam.pitch = 0;
    cam.roll = 0;
}
