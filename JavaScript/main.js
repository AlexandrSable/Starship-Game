///////////////////////////////////////////////////////////////////////////
// Explanation thing
///////////////////////////////////////////////////////////////////////////

////////////////////////////// IMPORT UTILITY /////////////////////////////

import { clamp, lerp, approach, packRGBA, v3, approachAngle                                             } from './supportMathFuncs.js';
import { ship, startBarrelRoll, updateShipResources                                                     } from './playerShip.js';
import { drawUI                                                                                         } from './UIDraw.js';
import { drawObstacles, drawShip, drawShipShadowScaled, drawProjectiles, drawEnemies, drawBoxObstacle   } from './sRasterizer.js';
import { updateObstacles, checkCollisions, cullObstacles, obstacles                                     } from './sceneHandler.js';
import { updateEnemies, updateEnemyShots, enemies, applyDamageToPlayer, resetLevel                      } from './enemyHandler.js';

function clearWO() {
    WOBuffer32.fill(0);
}
function clearUI() {
    UIBuffer32.fill(0);
}
function clearZ() { 
    zbuf.fill(1e9);
}
function clearSSVE() {
    SSVEBuffer32.fill(0);
}

//////////////////////// Buffer & Global setup ////////////////////////////

export let MAINMENUOPENED = true;

const canvas = document.getElementById("FinalRender");
const ctx = canvas.getContext("2d", { alpha: false });

export const fovPx = 260;
export const canvasWidth = canvas.width
export const canvasHeight = canvas.height;

export let deltaTime = 0;
export let fpsCounter = 0;

export let bestScore = localStorage.getItem('bestScore') ? parseInt(localStorage.getItem('bestScore')) : 0;

export function resetBestScore(Value) {
    bestScore = Value;
    localStorage.setItem('bestScore', bestScore);
}

export const cx = canvasWidth * 0.5;
export const cy = canvasHeight * 0.5;

const img = ctx.createImageData(canvasWidth, canvasHeight);

const FinalImage32  = new Uint32Array(img.data.buffer);
export const BGBuffer32    = new Uint32Array (canvasWidth * canvasHeight);
export const WOBuffer32    = new Uint32Array (canvasWidth * canvasHeight);
export const UIBuffer32    = new Uint32Array (canvasWidth * canvasHeight);
export const zbuf          = new Float32Array(canvasWidth * canvasHeight);
export const SSVEBuffer32  = new Uint32Array (canvasWidth * canvasHeight);

export const projectiles = [];
export const enemyShots = [];
const PROJ_SPEED = 110;
const PROJ_LIFE  = 2.2;
export const PROJ_COLOR = packRGBA(10, 220, 255, 255);

////////////////// Procedural Ground and SpAcE Textures ///////////////////

function bitShiftRNG(seed) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed;
}

// Ground Texture
const TEX = 256;
const tex = new Uint32Array(TEX * TEX);
for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
        const gx = (x & 31) === 0;
        const gy = (y & 31) === 0;
        const checker = ((x >> 1.0) ^ (y >> 1.0)) & 1;

        let r = 20, g = 140, b = 120;
        if (checker) { r += 10; g += 10; b += 10; }
        if ((gx || gy)) { r = 230; g = 230; b = 230; }
        tex[y * TEX + x] = packRGBA(r, g, b, 255);
    }
}

// Starfield Texture (for main menu of course)
const STAR_COUNT = 800;
const stars = new Float32Array(STAR_COUNT * 6);

const STAR_DRIFT_X = 10.0;
const STAR_DRIFT_Y = 6.0;

function renderStars(dt) {
    BGBuffer32.fill(packRGBA(0, 0, 8, 255));

    const speedZ = 10;
    for (let i = 0; i < STAR_COUNT; i++) {
        let StarColor = packRGBA(bitShiftRNG(i) * 255, bitShiftRNG(i) * 255, bitShiftRNG(i) * 255, 255);
        const ix = i * 3;
        stars[ix + 2] -= speedZ * dt;
        stars[ix + 0] += STAR_DRIFT_X * dt; 
        stars[ix + 1] -= STAR_DRIFT_Y * dt; 

        const z = stars[ix + 2];
        if (z < 2 || stars[ix + 0] > 60 || stars[ix + 0] < -60 || stars[ix + 1] > 40 || stars[ix + 1] < -40) {
            stars[ix + 0] = (Math.random() * 2 - 1) * 140;
            stars[ix + 1] = (Math.random() * 2 - 1) * 122;
            stars[ix + 2] = 120;
        }

        const sx = (stars[ix + 0] / z) * fovPx*3 + cx;
        const sy = (stars[ix + 1] / z) * -fovPx*3 + cy;

        const x = sx | 0;
        const y = sy | 0;
        if (x < 0 || x >= canvasWidth || y < 0 || y >= canvasHeight) continue;

        BGBuffer32[y * canvasWidth + x] = StarColor;
    }
}

///////////////////////////// INPUT HANDLING //////////////////////////////

const HOLD_TIME = 0.15;  // seconds before a hold is triggered
const TAP_TIME = 0.1;  // seconds threshold for a tap

const keyState = {
    Q: { down:false, t:0, didHold:false },
    E: { down:false, t:0, didHold:false },
};

const keys = new Set();
window.addEventListener("keydown"   , (e) => keys.add(e.code));
window.addEventListener("keyup"     , (e) => keys.delete(e.code));

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.code === "KeyQ") { keyState.Q.down = true; keyState.Q.t = 0; keyState.Q.didHold = false; }
  if (e.code === "KeyE") { keyState.E.down = true; keyState.E.t = 0; keyState.E.didHold = false; }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "KeyQ") { keyState.Q.down = false; onQERelease(-1, keyState.Q); }
  if (e.code === "KeyE") { keyState.E.down = false; onQERelease(+1, keyState.E); }
});

function updateQEHolds(dt) {
    // Q hold - rotate to nearest right (clockwise)
    if (keyState.Q.down) {
        keyState.Q.t += dt;
        if (!keyState.Q.didHold && keyState.Q.t >= HOLD_TIME) {
            keyState.Q.didHold = true;
            // Cancel any barrel roll that might have started
            ship.rollActive = false;
            // Find nearest +90° position (could be π/2 or -3π/2)
            const rightTarget = Math.PI * 0.5;
            const rightAlt = rightTarget - Math.PI * 2;
            ship.sideTarget = Math.abs(ship.sideTilt - rightTarget) <= Math.abs(ship.sideTilt - rightAlt) ? rightTarget : rightAlt;
        }
    }

    // E hold - rotate to nearest left (counterclockwise)
    if (keyState.E.down) {
        keyState.E.t += dt;
        if (!keyState.E.didHold && keyState.E.t >= HOLD_TIME) {
            keyState.E.didHold = true;
            // Cancel any barrel roll that might have started
            ship.rollActive = false;
            // Find nearest -90° position (could be -π/2 or 3π/2)
            const leftTarget = -Math.PI * 0.5;
            const leftAlt = leftTarget + Math.PI * 2;
            ship.sideTarget = Math.abs(ship.sideTilt - leftTarget) <= Math.abs(ship.sideTilt - leftAlt) ? leftTarget : leftAlt;
        }
    }
}

function onQERelease(dir, st) {
    // If a hold was triggered, or the key was held long enough, return to neutral
    if (st.didHold || st.t >= HOLD_TIME) {
        ship.sideTarget = 0; // go back to normal orientation
        return;
    }

    // Only do barrel roll on very quick taps (under 0.15 seconds)
    if (st.t < 0.15) {
        startBarrelRoll(dir);
    }
}

const keyPrev = new Set();

function KeyPressed(key) {
    return keys.has(key) && !keyPrev.has(key);
}

function endFrameKeys() {
    keyPrev.clear();
    for (const k of keys) keyPrev.add(k);
}

let prevSpace = false;
function handleShooting() {
  const space = keys.has("Space");
  if (space && !prevSpace) spawnProjectile();
  prevSpace = space;
}

function spawnProjectile() {
  // Spawn from ship "nose" - use fixed offset in front of ship
  const muzzleLocal = v3(0, -0.2, 17);  // Small projectile spawns slightly ahead

  // Convert to world base (same convention you use to place the ship)
  const p = {
    pos: v3(cam.x + ship.pos.x      + muzzleLocal.x,
            cam.height + ship.pos.y + muzzleLocal.y,
            cam.z                   + muzzleLocal.z),

    vel: v3(0, 0, PROJ_SPEED),   // forward along +Z (your world forward)
    half: v3(0.2, 0.2, 0.4),    // collision half-extents for the projectile
    life: PROJ_LIFE,
    yaw: 0, pitch: Math.PI * 0.5, roll: 0,  // Point along Z axis
    scale: 0.1,  // Much smaller projectiles
    sideTilt: 0,
    color: PROJ_COLOR  // cyan color for player projectiles
  };

  projectiles.push(p);
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;

    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.pos.z += p.vel.z * dt;

    // Check collision with obstacles
    let hitObstacle = false;
    for (const o of obstacles) {
      // Simple AABB collision
      if (Math.abs(p.pos.x - o.pos.x) <= (p.half.x + o.half.x) &&
          Math.abs(p.pos.y - o.pos.y) <= (p.half.y + o.half.y) &&
          Math.abs(p.pos.z - o.pos.z) <= (p.half.z + o.half.z)) {
        projectiles.splice(i, 1);
        hitObstacle = true;
        break;
      }
    }
    if (hitObstacle) continue;

    if (p.life <= 0) projectiles.splice(i, 1);
  }
}

/////////////////////////// MODE 7 BACKGROUND /////////////////////////////

// ---- camera ----
export const cam = {
    x: 0,
    z: 0,
    pitch: 0,
    roll: 0,
    height: 5.0,   
    speed: 20.0,
};

let lastT = performance.now();
let lastCamZ = 0;  // Track camera z position for distance-based scoring

function renderMode7() {
// Horizon (pitch)
    const baseHorizon = canvasHeight * 0.5;
    let horizon = baseHorizon - cam.pitch * canvasHeight * 0.3;
    
    // Pre-calculate roll rotation
    const cosRoll = Math.cos(cam.roll);
    const sinRoll = Math.sin(cam.roll);
    const screenCenterX = canvasWidth * 0.5;
    const screenCenterY = canvasHeight * 0.5;

    const scale = 260;
    const fov = 1.0;

    for (let y = 0; y < canvasHeight; y++) {
        // Rotate screen coordinate around center by -roll to get unrotated position
        const screenY = y - screenCenterY;
        let unrotY = screenCenterY;
        
        for (let x = 0; x < canvasWidth; x++) {
            const screenX = x - screenCenterX;
            
            // Inverse rotation: rotate back by -roll to get unrotated screen position
            const unrotX = screenX * cosRoll + screenY * sinRoll + screenCenterX;
            unrotY = -screenX * sinRoll + screenY * cosRoll + screenCenterY;

            if (unrotY < horizon) {
                // Sky
                let t = unrotY / Math.max(1, horizon);
                t = Math.max(0, Math.min(1, t)); // Clamp to 0->1 range to prevent gaps in coners

                const col = packRGBA((10 + 100 * t) | 0, 0, (40 + 70 * t) | 0); 
                BGBuffer32[y * canvasWidth + x] = col;
            } 
            else 
            {
                // Ground
                const dy = (unrotY - horizon) + 0.0001;
                const dist = (cam.height * scale) / dy;
                const halfW = dist * fov;
                const ratio = unrotX / canvasWidth;

                let wx = cam.x + 0 * dist - 1 * halfW + ratio * 2 * halfW;
                let wz = cam.z + 1 * dist;

                const u = ((wx | 0) & (TEX - 1));
                const v = ((wz | 0) & (TEX - 1));

                const col = tex[v * TEX + u];
                const r = (col & 255);
                const g = (col >> 8) & 255;
                const b = (col >> 16) & 255;

                BGBuffer32[y * canvasWidth + x] = packRGBA(r, g, b, 255);
            }
        }
    }
}

/////////////////////// Updates and Draw to Canvas ////////////////////////

function compositeBuffers() {
    // BG + World
    for (let i = 0; i < FinalImage32.length; i++) {
        const w = WOBuffer32[i];
        const a = w >>> 24;  // alpha byte
        FinalImage32[i] = (a !== 0) ? w : BGBuffer32[i];
    }
    
    // SSVE + Result
    for (let i = 0; i < FinalImage32.length; i++) {
        const s = SSVEBuffer32[i];
        const a = s >>> 24;  // alpha byte
        FinalImage32[i] = (a !== 0) ? s : FinalImage32[i];
    }

    // Result + UI
    for (let i = 0; i < FinalImage32.length; i++) {
        const u = UIBuffer32[i];
        const a = u >>> 24;  // alpha byte
        FinalImage32[i] = (a !== 0) ? u : FinalImage32[i];
    }

}

function update(deltaTime) {
    // Vertical tilt (pitch) - W/S to look up/down
    const tilt = 1.2;
    if (keys.has("KeyW")) cam.pitch -= tilt * deltaTime;
    if (keys.has("KeyS")) cam.pitch += tilt * deltaTime;
    cam.pitch = clamp(cam.pitch, -0.5, 0.5);
    cam.pitch *= Math.pow(0.1, deltaTime); // auto-centre

    // Horizontal tilt (roll) - Q/E to tilt left/right
    const rollSpeed = 0.5;
    if (keys.has("KeyD")) cam.roll -= rollSpeed * deltaTime;
    if (keys.has("KeyA")) cam.roll += rollSpeed * deltaTime;
    cam.roll = clamp(cam.roll, -0.2, 0.2);
    cam.roll *= Math.pow(0.1, deltaTime); // auto-centre

    // Speed control - Arrow Up to boost, Arrow Down to slow
    const speedChangeRate = 30;  // units/sec acceleration
    const minSpeed = 10;
    const maxSpeed = 40;
    
    if (keys.has("ArrowUp") && ship.Energy > 0) {
        // Boost: increase speed and consume energy
        cam.speed = Math.min(maxSpeed, cam.speed + speedChangeRate * deltaTime);
        ship.Energy -= 15 * deltaTime;  // Energy cost per second
        ship.lastEnergyUseTime = 0;  // Reset regen timer
    } else if (keys.has("ArrowDown")) {
        // Slow down: decrease speed (no energy cost)
        cam.speed = Math.max(minSpeed, cam.speed - speedChangeRate * deltaTime);
    } else {
        // Return to normal speed gradually
        const normalSpeed = 20;
        if (cam.speed > normalSpeed) {
            cam.speed = Math.max(normalSpeed, cam.speed - speedChangeRate * 0.5 * deltaTime);
        } else if (cam.speed < normalSpeed) {
            cam.speed = Math.min(normalSpeed, cam.speed + speedChangeRate * 0.5 * deltaTime);
        }
    }

    //(ship.pos.x / 10) !!!ADD THIS TO CAMERA TO PAN IT WITH THE SHIP!!!
    cam.x += (ship.pos.x / 10) * cam.speed * deltaTime;
    ship.pos.x -= (ship.pos.x / 10) * cam.speed * deltaTime;
    cam.z += 1 * cam.speed * deltaTime;
    
    // Award points for distance traveled (0.1 points per unit)
    const distanceTraveled = cam.z - lastCamZ;
    if (distanceTraveled > 0) {
        ship.Score += distanceTraveled * 0.1;
        lastCamZ = cam.z;
    }
}

function updateShip(deltaTime) {
    const horizontalSpeed = 75.0;
    const verticalSpeed = 75.0;
    const horizontalDamping = 0.85;

    updateQEHolds(deltaTime);
    updateShipResources(deltaTime);  // Update shield and energy regeneration
    ship.sideTilt = approachAngle(ship.sideTilt, ship.sideTarget, ship.sideSpeed * deltaTime);


    let inputX = 0;
    if (keys.has("KeyA")) inputX -= 1;
    if (keys.has("KeyD")) inputX += 1;

    ship.xVel += inputX * horizontalSpeed * deltaTime;
    ship.xVel *= Math.pow(horizontalDamping, deltaTime * 60);

    ship.pos.x += ship.xVel * deltaTime;
    ship.pos.x = clamp(ship.pos.x, -100.0, 100.0);



    // slight pitch up/down (optional)
    let inputY = 0;
    if (keys.has("KeyS")) inputY -= 1;
    if (keys.has("KeyW")) inputY += 1;

    ship.yVel += inputY * verticalSpeed * deltaTime;
    ship.yVel *= Math.pow(horizontalDamping, deltaTime * 60);
    ship.pos.y += ship.yVel * deltaTime;
    ship.pos.y = clamp(ship.pos.y, -5.0, 5.0);

    // Pitch follows vertical input with smooth easing
    const targetPitch = clamp(-inputY * 0.2, -0.6, 0.6);
    ship.pitch = lerp(ship.pitch, targetPitch, 1 - Math.pow(horizontalDamping, deltaTime * 60));

    if (ship.rollActive) {
    ship.rollT += deltaTime;
    const t = clamp(ship.rollT / ship.rollDuration, 0, 1);

    const s = t * t * (3 - 2 * t);

    ship.roll = lerp(ship.rollStart, ship.rollEnd, s);

    if (t < 0.5) ship.pos.x += ship.rollDir * 5.0 * deltaTime;

    if (t >= 1) {
        ship.rollActive = false;
        ship.roll = ((ship.roll % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (ship.roll > Math.PI) ship.roll -= Math.PI * 2;
    }
    } else {
    const targetRoll = clamp(-ship.xVel * 0.5, -0.8, 0.8);
    ship.roll = lerp(ship.roll, targetRoll, 1 - Math.pow(horizontalDamping, deltaTime * 60));
    ship.rollActive = false;
    }

}

function renderFrame(t) {
    deltaTime = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;
    if(Math.sin(t) > 0.9) fpsCounter = 1/deltaTime;

    clearWO();
    clearZ();
    clearUI();
    clearSSVE();

    if(!MAINMENUOPENED){
        if (keys.has("Escape")) 
        {
            resetLevel();
            MAINMENUOPENED = true;
        }
        ship.yaw = 0.0;
        ship.pos.z = 0.0;
        // Run the game
        update(deltaTime);
        handleShooting();
        updateShip(deltaTime);
        updateObstacles(deltaTime);
        updateEnemies(deltaTime, enemyShots, projectiles);
        updateProjectiles(deltaTime);
        updateEnemyShots(deltaTime, enemyShots);

        checkCollisions();
        cullObstacles();

        renderMode7();
        drawShipShadowScaled();
        drawObstacles();
        drawEnemies(drawBoxObstacle);
        drawShip();
        drawProjectiles();

    }
    else
    {
        if (keys.has("Space")) MAINMENUOPENED = false;
        // Draw Main Menu
        renderStars(deltaTime);
        ship.lightDir = v3(0, 1, -1);
        ship.pos.x = 0;
        ship.pos.y = -0.5;
        ship.pos.z = -3.5;

        ship.pitch = -45 * Math.PI / 180;
        ship.yaw = -70 * Math.PI / 180;

        ship.rollActive = true;
        ship.rollT = 0.05;
        ship.rollStart = ship.roll;
        ship.rollEnd = ship.rollStart - 0.1 * Math.PI * 2;

        updateShip(deltaTime);
        drawShip();
    }

    drawUI(t);
    compositeBuffers();
    ctx.putImageData(img, 0, 0);

    endFrameKeys();
    requestAnimationFrame(renderFrame);
}

requestAnimationFrame(renderFrame);