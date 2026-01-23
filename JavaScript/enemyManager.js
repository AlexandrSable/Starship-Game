import { v3, packRGBA, clamp, aimAngles, approachAngle} from "./supportMathFuncs.js";
import { cam, projectiles, enemyShots, resetBestScore, bestScore, GoToMenu, playSoundSingular, sounds } from "./main.js";
import { ship } from "./playerShip.js";
import { obstacles, resetSceneSpawner } from "./sceneManager.js";
import { spawnExplosion } from "./vfxManagher.js";

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
        // Simple AABB ray intersection (Cool math that i do not understand to full extent, but i mean, it works)
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
    // Check for intersection 
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    
    let tmin = -Infinity;
    let tmax = Infinity;
    
    // Check x plane
    if (Math.abs(dx) > 0.001) {
        const t1 = (aabbMin.x - p1.x) / dx;
        const t2 = (aabbMax.x - p1.x) / dx;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (p1.x < aabbMin.x || p1.x > aabbMax.x) {
        return false;
    }
    
    // Check y plane
    if (Math.abs(dy) > 0.001) {
        const t1 = (aabbMin.y - p1.y) / dy;
        const t2 = (aabbMax.y - p1.y) / dy;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (p1.y < aabbMin.y || p1.y > aabbMax.y) {
        return false;
    }
    
    // Check z plane
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
        pos: v3(cx, 0, zWorld),  // Spawn on ground level (y=0)
        yaw: 0,
        pitch: 0,
        roll: 0,
        scale: 1.0,
        sideTilt: 0,
        dmg: 1,
        shotSpeed: 50,
        fireRate: 0.9,  // seconds between shots
        cooldown: 0.3,  // fire faster on spawn
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
    const spawnHeight = cam.height + 30;  // Spawn drones above the camera
    const spawnZ = cam.z + 400;           // Spawn further in front of the camera
    
    enemies.push({
        type: "drone",
        pos: v3(
            cx,
            spawnHeight,
            spawnZ
        ),
        yaw: 0,
        pitch: 0,
        roll: 0,
        scale: 3.5,
        sideTilt: 0,
        dmg: 1,
        shotSpeed: 60,
        fireRate: 1.5,  // seconds between shots
        cooldown: 0.2,  // fire faster on spawn
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
    const player = shipWorldCenter();

    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];

        // despawn behind camera (only for turrets)
        if (e.type === "turret") {
            const despawnDist = 15;
            if (e.pos.z < cam.z - despawnDist) { enemies.splice(i,1); continue; }
        } else if (e.type === "drone") {
            // Drones never despawn on Z, but do if you are too far on X
            if (Math.abs(e.pos.x - cam.x) > 100 || e.pos.y < -20) {
                enemies.splice(i,1); 
                continue; 
            }
        }

        // --- rotate toward player ---
        if (e.type === "turret") {
            // Only consider X and Z position difference (ignore Y height)
            const dx = player.x - e.pos.x;
            const dz = player.z - e.pos.z;
            const targetYaw = Math.atan2(dx, dz);
            const turn = 2.8;
            e.yaw = approachAngle(e.yaw, targetYaw, turn * dt);
            // Lock all other rotations
            e.pitch = -Math.PI * 0.5;  // -90 degrees to point forward 
            e.roll = 0;   
            e.sideTilt = 0;  
        } else if (e.type === "drone") {
            // Drones face toward the player
            const dx = player.x - e.pos.x;
            const dz = player.z - e.pos.z;
            const targetYaw = Math.atan2(dx, dz);
            
            const turn = 5.0;
            e.yaw   = approachAngle(e.yaw, targetYaw, turn * dt);
            e.pitch = -Math.PI * 0.5;  // Point forward correctly
            e.roll = 0;
            e.sideTilt = 0;
        }

        // --- movement for drones ---
        if (e.type === "drone") {
            // Fly towards the player from their spawn position
            const desiredZOffset = 50;  
            const targetX = cam.x;
            const targetZ = cam.z + desiredZOffset;
            
            // Vary Y position preventing drones gathering in one spot
            const yOffset = Math.sin(e.phase + performance.now() * 0.001) * 5;
            const targetY = cam.height + yOffset;
            
            const moveSpeed = 55;  // Drones fly speed
            const driftX = clamp(targetX - e.pos.x, -moveSpeed, moveSpeed);
            const driftY = clamp(targetY - e.pos.y, -moveSpeed, moveSpeed);
            const driftZ = clamp(targetZ - e.pos.z, -moveSpeed, moveSpeed);  // Match speed on all axes
            
            // Test new position for collision before applying
            const newPosX = e.pos.x + driftX * dt;
            const newPosY = e.pos.y + driftY * dt;
            const newPosZ = e.pos.z + driftZ * dt;
            const testPosY = clamp(newPosY, -10, 12);
            
            // Check if new position would collide with obstacles
            let canMove = true;
            for (const o of obstacles) {
                if (aabbHit({x: newPosX, y: testPosY, z: newPosZ}, e.half, o.pos, o.half)) {
                    canMove = false;
                    break;
                }
            }
            
            // Only apply movement if no collision
            if (canMove) {
                e.pos.x = newPosX;
                e.pos.y = testPosY;
                e.pos.z = newPosZ;
            } else {
                // Kill drone if trapped in obstacle
                e.hp = 0;
            }
        }

        // --- shooting ---
        e.cooldown -= dt;
        if (e.cooldown <= 0) {
            e.cooldown = e.fireRate;

            // shoot if within range and has line of sight
            const dist = Math.hypot(player.x - e.pos.x, player.y - e.pos.y, player.z - e.pos.z);

            // For drones only shoot if they are in front of the player
            const canShoot = (e.type === "drone") ? (e.pos.z > cam.z && dist > 20) : true;

            if (canShoot && dist < 150 && hasLineOfSight(e.pos, player)) {
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
                    // Spawn explosion at enemy position
                    spawnExplosion(e.pos, { size: e.type === "turret" ? 50 : 35, life: 0.6 });
                    // Play explosion sound
                    playSoundSingular(sounds.explosion, 0.3);
                    enemies.splice(i, 1);
                    break; // enemy is dead, stop checking
                }
            }
        }
    }
}

export function updateEnemyShots(dt, enemyShots) {
    const shipC = shipWorldCenter();
    const shipHalf = v3(2.0, 1.2, 2.5);

    for (let i = enemyShots.length - 1; i >= 0; i--) {
        const s = enemyShots[i];
        
        if (!s) continue;
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
            applyDamageToPlayer(s.dmg);
            enemyShots.splice(i,1);
        }
    }
}


function spawnEnemyShot(enemy, dir, enemyShots) {
    const speed = enemy.shotSpeed;
    console.log("Enemy shot fired");
    
    // Play enemy shoot sound
    playSoundSingular(sounds.smallPew, 0.2);

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
    //console.log(`Player took ${damage} damage Shield: ${Math.max(0, ship.Shield)}/${ship.ShieldMax}`);
    
    // Check if player is dead
    if (ship.Shield <= 0) {
        onPlayerDeath();
    }
}

function onPlayerDeath() {
    console.log("Player died! Resetting level...");
    resetBestScore(Math.max(bestScore, Math.floor(ship.Score)));
    resetLevel();
    GoToMenu();
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
    
    // Reset scene spawner
    resetSceneSpawner();
}
