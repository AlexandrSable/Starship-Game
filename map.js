import { v3, packRGBA } from "./supMathFunc.js";
import { cam } from "./main.js";
import { ship } from "./ship.js";

///////////////////////// Gameplay functionality //////////////////////////

export const obstacles = [];

function spawnBox(zAhead, x, groundY, w, h, d, color) {
    // store half extents
    const hx = w * 0.5;
    const hy = h * 0.5;
    const hz = d * 0.5;

    // sit on ground: center.y = groundY + hy
    obstacles.push({
    pos: v3(x, groundY + hy, cam.z + zAhead),
    half: v3(hx, hy, hz),
    color
    });
}

function maybeSpawnObstacle() {
    if (obstacles.length > 14) return;

    const lanes = [-6, -2, 2, 6];
    const x = lanes[(Math.random() * lanes.length) | 0];

    const zAhead = 50 + Math.random() * 90;

    const w = 2 + Math.random() * 4; // width
    const h = 2 + Math.random() * 6; // height
    const d = 2 + Math.random() * 5; // depth

    spawnBox(zAhead, x, 0.0, w, h, d, packRGBA(180, 80, 80, 255));
}

// test git
function checkCollisions() {
    const shipWorldBase = v3(cam.x, cam.height, cam.z + ship.toCamDist);
    const shipC = v3(
        shipWorldBase.x + ship.pos.x,
        shipWorldBase.y + ship.pos.y,
        shipWorldBase.z + ship.pos.z
    );

    const shipHalf = v3(1.0, 1.0, 1.0); // tune

    const shipMin = v3(shipC.x - shipHalf.x, shipC.y - shipHalf.y, shipC.z - shipHalf.z);
    const shipMax = v3(shipC.x + shipHalf.x, shipC.y + shipHalf.y, shipC.z + shipHalf.z);

    for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        const oMin = v3(o.pos.x - o.half.x, o.pos.y - o.half.y, o.pos.z - o.half.z);
        const oMax = v3(o.pos.x + o.half.x, o.pos.y + o.half.y, o.pos.z + o.half.z);

        const hit =
            (shipMin.x <= oMax.x && shipMax.x >= oMin.x) &&
            (shipMin.y <= oMax.y && shipMax.y >= oMin.y) &&
            (shipMin.z <= oMax.z && shipMax.z >= oMin.z);

        if (hit) {
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

export {
    maybeSpawnObstacle,
    checkCollisions,
    cullObstacles
};