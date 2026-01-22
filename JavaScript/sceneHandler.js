import { v3, packRGBA, clamp, v3Add, rotateX, rotateY, rotateZ } from "./supportMathFuncs.js";
import { cam } from "./main.js";
import { ship } from "./playerShip.js";
import { spawnTurret, spawnDrone } from "./enemyHandler.js";


///////////////////////// Gameplay functionality //////////////////////////

export const obstacles = [];
let nextSpawnZ = 100;  // Start generation further ahead to give player time at start

const spawnAhead = 300;    // how far ahead we maintain content
const despawnBehind = 30;  // remove when behind camera

let difficulty = 0;

// Flight bounds (tune)
const X_MIN = -100, X_MAX = 100;
const Y_MIN = -12,  Y_MAX = 12;

const CORRIDOR_COUNT = 7;     // 3-wide
const CORRIDOR_SPACING = 35;  // world units between corridor centres (tune)

// Optional: enforce player flight band so “fly over everything” is impossible
export const FLIGHT = { X_MIN, X_MAX, Y_MIN, Y_MAX };

function shipHalfExtents() {
  // make X bigger if you want roll to matter
  return v3(2.0, 0.6, 2.5);
}

function shipWorldCenter() {
    const shipWorldBase = v3(cam.x, cam.height, cam.z + ship.toCamDist);
    return v3(
        shipWorldBase.x + ship.pos.x,
        shipWorldBase.y + ship.pos.y,
        shipWorldBase.z + ship.pos.z
    );
}

function spawnBoxWorld(zWorld, x, groundY, w, h, d, color) {
    const hy = h * 0.5;
    obstacles.push({
        pos: v3(x, groundY + hy, zWorld),     // <-- centre lifted by half height
        half: v3(w*0.5, hy, d*0.5),
        color
    });
}

function spawnCorridorEnemies(zWorld, cx, cy, hw, hh) {
    const r = Math.random();
    // Spawn enemies further ahead (at zWorld + 50-80) so player can see them coming
    const spawnOffset = 50 + Math.random() * 30;
    if (r < 0.35) spawnTurret(zWorld + spawnOffset, cx + (Math.random()*2-1)*hw*0.6);
    else if (r < 0.70) spawnDrone(zWorld + spawnOffset, cx, cy, hh);
    // else none
}

// test git
function checkCollisions() {
    const shipWorldBase = v3(cam.x, cam.height, cam.z + ship.toCamDist);
    const shipC = v3(
        shipWorldBase.x + ship.pos.x,
        shipWorldBase.y + ship.pos.y,
        shipWorldBase.z + ship.pos.z
    );

    // Ship half-extents (in model space)
    const shipHalf = v3(2.2, 0.7, 1.0);

    // Get the 8 corners of the ship's bounding box in model space
    const corners = [
        v3(-shipHalf.x, -shipHalf.y, -shipHalf.z),
        v3( shipHalf.x, -shipHalf.y, -shipHalf.z),
        v3(-shipHalf.x,  shipHalf.y, -shipHalf.z),
        v3( shipHalf.x,  shipHalf.y, -shipHalf.z),
        v3(-shipHalf.x, -shipHalf.y,  shipHalf.z),
        v3( shipHalf.x, -shipHalf.y,  shipHalf.z),
        v3(-shipHalf.x,  shipHalf.y,  shipHalf.z),
        v3( shipHalf.x,  shipHalf.y,  shipHalf.z),
    ];

    // Rotate corners by ship's rotation (same order as rendering: Z, X, Y)
    const rotatedCorners = corners.map(c => {
        let p = rotateZ(c, ship.roll + ship.sideTilt);
        p = rotateX(p, ship.pitch);
        p = rotateY(p, ship.yaw);
        return v3Add(p, shipC);  // Translate to world position
    });

    // Find rotated AABB bounds
    let shipMinX = rotatedCorners[0].x, shipMaxX = rotatedCorners[0].x;
    let shipMinY = rotatedCorners[0].y, shipMaxY = rotatedCorners[0].y;
    let shipMinZ = rotatedCorners[0].z, shipMaxZ = rotatedCorners[0].z;

    for (let i = 1; i < rotatedCorners.length; i++) {
        const c = rotatedCorners[i];
        shipMinX = Math.min(shipMinX, c.x);
        shipMaxX = Math.max(shipMaxX, c.x);
        shipMinY = Math.min(shipMinY, c.y);
        shipMaxY = Math.max(shipMaxY, c.y);
        shipMinZ = Math.min(shipMinZ, c.z);
        shipMaxZ = Math.max(shipMaxZ, c.z);
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        const oMin = v3(o.pos.x - o.half.x, o.pos.y - o.half.y, o.pos.z - o.half.z);
        const oMax = v3(o.pos.x + o.half.x, o.pos.y + o.half.y, o.pos.z + o.half.z);

        // AABB collision test using rotated ship bounds
        const hit =
            (shipMinX <= oMax.x && shipMaxX >= oMin.x) &&
            (shipMinY <= oMax.y && shipMaxY >= oMin.y) &&
            (shipMinZ <= oMax.z && shipMaxZ >= oMin.z);

        if (hit) {
            ship.Shield -= 1;  // Damage shield
            ship.lastDamageTime = 0;  // Reset damage timer for regeneration
            ship.Score -= 50;  // Lose points for hitting obstacle
            obstacles.splice(i, 1);
            break;
        }
    }
}

function cullObstacles() {
    for (let i = obstacles.length - 1; i >= 0; i--) {
        if (obstacles[i].pos.z < cam.z - 10) obstacles.splice(i, 1);
    }
}

function spawnCorridorContent(zWorld, cx, cy, hw, hh) {
    const r = Math.random();
    if (r < 0.40) patternPylons(zWorld, cx, cy, hw, hh);
    else if (r < 0.60) patternCeilingBeam(zWorld, cx, cy, hw, hh);
    else if (r < 0.80) patternFloorBlock(zWorld, cx, cy, hw, hh);
    else patternRollGate(zWorld, cx, cy, hw, hh);

    spawnCorridorEnemies(zWorld, cx, cy, hw, hh);
}

export function updateObstacles(dt) {
    // 1) despawn
    for (let i = obstacles.length - 1; i >= 0; i--) {
        if (obstacles[i].pos.z < cam.z - despawnBehind) obstacles.splice(i, 1);
    }

    // 2) keep spawning forward
    if (nextSpawnZ < cam.z) nextSpawnZ = cam.z + 60;

    while (nextSpawnZ < cam.z + spawnAhead) {
        spawnSegment(nextSpawnZ);
        nextSpawnZ += segmentLength();
    }

    // 3) difficulty ramp (optional)
    difficulty = Math.min(1, difficulty + dt * 0.02);
}

function segmentLength() {
    return 20 + Math.random() * 15; // Increased spacing between obstacle groups
}

function spawnSegment(zWorld) {
    const s = shipWorldCenter();

    // base corridor follows ship (no lag)
    const baseX = clamp(s.x, X_MIN + 10, X_MAX - 10);
    const baseY = clamp(s.y, Y_MIN + 6,  Y_MAX - 6);

    // corridor size must fit ship
    const he = shipHalfExtents();
    const hw = Math.max(he.x + 1.5, 12 - 6 * difficulty);
    const hh = Math.max(he.y + 1.5,  7 - 3 * difficulty);

    // corridor vertical center (world-space)
    let cy = baseY;

    // ensure corridor bottom is above ground
    const GROUND_Y = 0.0;
    const MIN_CLEAR = 0.5;             // small clearance so it doesn't clip
    const minCy = GROUND_Y + hh + MIN_CLEAR;

    cy = Math.max(cy, minCy);

    // spawn 3 corridors: left, center, right
    const mid = (CORRIDOR_COUNT / 2) | 0;

    for (let i = 0; i < CORRIDOR_COUNT; i++) {
        const laneOffset = (i - mid) * CORRIDOR_SPACING;

        const cx = clamp(baseX + laneOffset, X_MIN + 10, X_MAX - 10);
        const cy = baseY;

        spawnCorridorContent(zWorld, cx, cy, hw, hh);
    }
}


function patternCeilingBeam(zWorld, cx, cy, hw, hh) {
  const beamW = hw * 2 + 10;
  const beamH = 6;
  const depth = 8;

  spawnBoxWorld(zWorld, cx, 10.0, beamW, beamH, depth, packRGBA(170,120,90,255));
}

function patternFloorBlock(zWorld, cx, cy, hw, hh) {
  const w = hw * 2 + 10;
  const h = 3;
  const depth = 8;

  spawnBoxWorld(zWorld, cx, 0.0, w, h, depth, packRGBA(110,160,110,255));
}

function patternRollGate(zWorld, cx, cy, hw, hh) {
  const gateH = hh * 2 + 16;
  const gateW = 29;
  const depth = 7;

  const gapW  = 3.0;
  const slabW = (gateW - gapW) * 0.5;

  const leftX  = cx - (gapW * 0.5 + slabW * 0.5);
  const rightX = cx + (gapW * 0.5 + slabW * 0.5);

  spawnBoxWorld(zWorld, leftX,  0.0, slabW, gateH, depth, packRGBA(160,110,180,255));
  spawnBoxWorld(zWorld, rightX, 0.0, slabW, gateH, depth, packRGBA(160,110,180,255));
}

function patternPylons(zWorld, cx, cy, hw, hh) {
  const pillarW = 10;
  const pillarH = 50;
  const depth   = 8;

  const leftX  = cx - hw - pillarW * 0.5;
  const rightX = cx + hw + pillarW * 0.5;

  spawnBoxWorld(zWorld, leftX,  0.0, pillarW, pillarH, depth, packRGBA(140,140,160,255));
  spawnBoxWorld(zWorld, rightX, 0.0, pillarW, pillarH, depth, packRGBA(140,140,160,255));
}
export {
    checkCollisions,
    cullObstacles
};