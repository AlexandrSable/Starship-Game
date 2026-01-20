///////////////////////////////////////////////////////////////////////////
// Explanation thing
///////////////////////////////////////////////////////////////////////////

const canvas = document.getElementById("FinalRender");
const ctx = canvas.getContext("2d", { alpha: false });

const canvasWidth = canvas.width
const canvasHeight = canvas.height;

const img = ctx.createImageData(canvasWidth, canvasHeight);

const FinalImage32  = new Uint32Array(img.data.buffer);
const BGBuffer32    = new Uint32Array(canvasWidth * canvasHeight);
const WOBuffer32    = new Uint32Array(canvasWidth * canvasHeight);
const UIBuffer32    = new Uint32Array(canvasWidth * canvasHeight);

//////////////////////////// UTILITY FUNCTIONS ////////////////////////////

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp =  (a, b, t) => a + (b - a) * t;
function scale2DAbout(p, ax, ay, s) {
    return { x: ax + (p.x - ax) * s, y: ay + (p.y - ay) * s, z: p.z };
}

//////////////////// Color & Basic Shading functions //////////////////////
function packRGBA(r, g, b, a = 255) {
    return (a << 24) | (b << 16) | (g << 8) | r;
}
function clear32(color) {
    WOBuffer32.fill(color);
}
const BAYER4 = [
    0,  8,  2, 10,
    12, 4, 14,  6,
    3, 11,  1,  9,
    15, 7, 13,  5
];
function dither4x4(x, y, t01) {
    const threshold = (BAYER4[(x & 3) + ((y & 3) << 2)] + 0.5) / 16; // 0..1
    return t01 >= threshold;
}
function unpackR(c) { return c & 255; }
function unpackG(c) { return (c >> 8) & 255; }
function unpackB(c) { return (c >> 16) & 255; }

///////////////// Vector Math functions (for simplicity) //////////////////
function v3(x = 0, y = 0, z = 0) { return { x, y, z }; }

function v3Add   (a, b)  { return v3(a.x + b.x, a.y + b.y, a.z + b.z); }
function v3Sub   (a, b)  { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }
function v3Scale (a, s)  { return v3(a.x * s, a.y * s, a.z * s); }
function v3Dot   (a, b)  { return a.x*b.x + a.y*b.y + a.z*b.z; }
function v3Cross (a, b)  { return v3(
                                    a.y*b.z - a.z*b.y,
                                    a.z*b.x - a.x*b.z,
                                    a.x*b.y - a.y*b.x
                                    );
}
function v3Normalize(a) {
    const l = Math.hypot(a.x, a.y, a.z) || 1;
    return v3(a.x/l, a.y/l, a.z/l);
}
///////////////////// Projection matrices & Rotation //////////////////////
function project3D(p) {
  // p = {x,y,z} in camera space, z must be > 0
    return {
    x: (p.x / p.z) * fovPx + cx,
    y: (p.y / p.z) * -fovPx + cy,
    z: p.z
    };
}
function rotateX(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return v3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
}
function rotateY(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return v3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}
function rotateZ(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return v3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
}
/////////////////////// Coordinate Space Transforms ///////////////////////
// World space -> Camera space
function worldToCamera(pw, cam) {
    // use cam.height as camera Y
    let p = v3(pw.x - cam.x, pw.y - cam.height, pw.z - cam.z);

    const pitch3D = cam.pitch * 0.41;
    const roll3D  = cam.roll  * 1.0;

    p = rotateX(p, -pitch3D);
    p = rotateZ(p, -roll3D);

    return p;
}
// Model space -> World space
function modelToWorld(p, ship) {
    // ZYX rotation order: roll (Z), pitch (X), yaw (Y)
    let r = v3(p.x * ship.scale, p.y * ship.scale, p.z * ship.scale);
    r = rotateZ(r, ship.roll);
    r = rotateX(r, ship.pitch);
    r = rotateY(r, ship.yaw);
    return v3Add(r, ship.pos);
}
///////////////////////////////////////////////////////////////////////////

//////////////////////// Pre-backed Tris Positions ////////////////////////

const shipVerts = [
  v3(0, 1.45, -2.9),
  v3(0.15, -1.25, -4.35),
  v3(-0.15, 1.25, -4.35),
  v3(0, 1.95, -4.4),
  v3(0, -1.95, -4.45),
  v3(-0.15, -1.25, -4.35),
  v3(0.15, 1.25, -4.35),
  v3(0, -1.45, -2.9),
  v3(-4.1, 0.05, 1.25),
  v3(-4.15, 0.15, 0.3),
  v3(-4.15, -0.05, 0.3),
  v3(-4.05, 0, 2.1),
  v3(-4, -0.95, 0.1),
  v3(-4, 1.05, 0.1),
  v3(0, 0.1, 4.5),
  v3(0, 1, -4.4),
  v3(-0.95, -0.95, -4.35),
  v3(-0.95, 0.95, -4.35),
  v3(0.95, -0.95, -4.35),
  v3(0.95, 0.95, -4.35),
  v3(0, -1.35, -4.5),
  v3(0, 1.35, -4.5),
  v3(-1.45, 0, -3.15),
  v3(-0.8, -0.8, -4.3),
  v3(0.8, -0.8, -4.3),
  v3(0, -1.1, -4.45),
  v3(0, 1.15, -4.45),
  v3(1.15, 0, -4.2),
  v3(4.1, 0.05, 1.25),
  v3(4.15, 0.15, 0.3),
  v3(4.15, -0.05, 0.3),
  v3(4.05, 0, 2.1),
  v3(0.75, -0.6, -4.4),
  v3(4, -0.95, 0.1),
  v3(4, 1.05, 0.1),
  v3(-0.75, -0.6, -4.4),
  v3(1.35, 0, -4.25),
  v3(-1.35, 0, -4.25),
  v3(1.45, 0, -3.15),
  v3(0.8, 0.8, -4.3),
  v3(-0.8, 0.8, -4.3),
  v3(-1.15, 0, -4.2),
  v3(0, -0.95, -1.75),
  v3(1.05, 0.95, -2),
  v3(-1.05, 0.95, -2),
  v3(0, -0.65, 0.25),
  v3(0.75, 0.65, 0.05),
  v3(-0.75, 0.65, 0.05),
  v3(4.3, 0.05, 0.1),
  v3(4.1, 0.05, 0.1),
  v3(-4.3, 0.05, 0.1),
  v3(-4.1, 0.05, 0.1),
  v3(1.85, -0.25, -4.1),
  v3(-0.15, 0.05, -4.1),
  v3(1.85, 0.35, -4.1),
  v3(-1.85, -0.25, -4.1),
  v3(0.15, 0.05, -4.1),
  v3(-1.85, 0.35, -4.1),
];

const shipTris = [
  [0, 3, 2],[2, 3, 6],[6, 3, 0],[1, 4, 5],[2, 6, 0],[7, 4, 1],[5, 4, 7],[1, 5, 7],
  [11, 13, 50],[50, 13, 51],[51, 13, 11],
  [36, 18, 24],[36, 24, 27],
  [17, 40, 41],[17, 41, 37],
  [18, 20, 25],[18, 25, 24],
  [17, 21, 26],[17, 26, 40],
  [19, 36, 27],[19, 27, 39],
  [37, 41, 23],[37, 23, 16],
  [20, 16, 23],[20, 23, 25],
  [21, 19, 39],[21, 39, 26],
  [31, 33, 48],[48, 49, 34],[31, 34, 49],
  [14, 32, 15],[14, 35, 32],[35, 14, 15],
  [29, 30, 10],[29, 10, 9],
  [30, 28, 8],[30, 8, 10],
  [28, 29, 9],[28, 9, 8],
  [16, 22, 37],[16, 20, 7],[22, 16, 7],
  [21, 0, 19],[36, 19, 38],[19, 0, 38],
  [20, 18, 7],[38, 18, 36],[18, 38, 7],
  [37, 22, 17],[21, 17, 0],[22, 0, 17],
  [35, 15, 32],
  [44, 43, 42],[43, 44, 47],[43, 47, 46],[42, 43, 46],[42, 46, 45],[44, 42, 45],[44, 45, 47],
  [33, 49, 48],
  [12, 50, 51],[12, 11, 50],[34, 31, 48],[12, 51, 11],[33, 31, 49],
  [38, 53, 52],[52, 53, 54],[54, 53, 38],[52, 54, 38],
  [22, 55, 56],[55, 57, 56],[57, 22, 56],[55, 22, 57],
];

const boxVerts = [
  v3(-1,-1,-1), v3( 1,-1,-1), v3( 1, 1,-1), v3(-1, 1,-1), // back  (z-)
  v3(-1,-1, 1), v3( 1,-1, 1), v3( 1, 1, 1), v3(-1, 1, 1), // front (z+)
];

const boxTris = [
// near face (z-)
  [0,2,1], [0,3,2],
  // left (x-)
  [0,3,7], [0,7,4],
  // right (x+)
  [1,5,6], [1,6,2],
  // top (y+)
  [3,2,6], [3,6,7],
];

//////////////////////// Gameplay related functions ///////////////////////

// Flat colours (one per triangle) – tweak as you like
const shipTriColors = shipTris.map((_, i) => {
    // subtle variation
    const base = 200 - (i % 4) * 10;
    return packRGBA(base, base, base + 20, 255);
});

const ship = {
    pos: v3(0.0, -4.0, 0.0),   // local offset relative to camera
    scale: 0.7,
    yaw: 0,
    pitch: 0,
    roll: 0,
    xVel: 0,
    yVel: 0,

    toCamDist: 12.0,
    rollActive: false,
    rollDir: 0,
    rollT: 0,
    rollDuration: 0.55,
    rollStart: 0,
    rollEnd: 0,
    rollInvulnTime: 0,
};

function cullObstacles() {
    for (let i = obstacles.length - 1; i >= 0; i--) {
        if (obstacles[i].pos.z < cam.z - 10) obstacles.splice(i, 1);
    }
}

function startBarrellRoll(dir) {
    if(ship.rollActive) return;

    ship.rollActive = true;
    ship.rollDir = dir;
    ship.rollT = 0;

    ship.xVel = dir * 40.0;
    ship.rollStart = ship.roll;
    ship.rollEnd = ship.rollStart - dir * Math.PI * 2;

    ship.rollInvulnTime = 0.45;
}

//////////////////////// Procedural Ground Texture ////////////////////////

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

/////////////////////////// MODE 7 BACKGROUND /////////////////////////////

// ---- input ----
const keys = new Set();
window.addEventListener("keydown"   , (e) => keys.add(e.code));
window.addEventListener("keyup"     , (e) => keys.delete(e.code));

const keyPrev = new Set();

function KeyPressed(key) {
    return keys.has(key) && !keyPrev.has(key);
}

function endFrameKeys() {
    keyPrev.clear();
    for (const k of keys) keyPrev.add(k);
}

// ---- camera ----
const cam = {
    x: 0,
    z: 0,
    pitch: 0,
    roll: 0,
    height: 5.0,   
    speed: 20.0,
};

let lastT = performance.now();

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

//////////////////////////// RASTERIZATION ////////////////////////////////

const zbuf = new Float32Array(canvasWidth * canvasHeight);

function clearZ() { zbuf.fill(1e9); }

function edge(ax, ay, bx, by, cx, cy) {
  return (cx - ax) * (by - ay) - (cy - ay) * (bx - ax);
}

// v = {x,y,z} where x,y are screen pixels, z is depth (smaller = closer)
function drawTriZ_Shaded(v0, v1, v2, baseColor, intensity) {
    const x0=v0.x, y0=v0.y, z0=v0.z;
    const x1=v1.x, y1=v1.y, z1=v1.z;
    const x2=v2.x, y2=v2.y, z2=v2.z;

    const area = edge(x0,y0, x1,y1, x2,y2);
    if (area === 0) return;
    const invA = 1 / area;

    const minX = Math.max(0, Math.floor(Math.min(x0,x1,x2)));
    const maxX = Math.min(canvasWidth-1, Math.ceil (Math.max(x0,x1,x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0,y1,y2)));
    const maxY = Math.min(canvasHeight-1, Math.ceil (Math.max(y0,y1,y2)));

    // clamp intensity
    intensity = clamp(intensity, 0, 1);

    const br = unpackR(baseColor);
    const bg = unpackG(baseColor);
    const bb = unpackB(baseColor);

    const darkMul  = 0.65;
    const lightMul = 1.00;

    for (let y=minY; y<=maxY; y++) {
        for (let x=minX; x<=maxX; x++) {
            const px = x + 0.5, py = y + 0.5;

            const w0 = edge(x1,y1, x2,y2, px,py) * invA;
            const w1 = edge(x2,y2, x0,y0, px,py) * invA;
            const w2 = 1 - w0 - w1;

            const inside =
            (w0 >= 0 && w1 >= 0 && w2 >= 0) ||
            (w0 <= 0 && w1 <= 0 && w2 <= 0);
            if (!inside) continue;

            const z = w0*z0 + w1*z1 + w2*z2;
            const idx = y*canvasWidth + x;
            if (z >= zbuf[idx]) continue;

            zbuf[idx] = z;

            const useLight = dither4x4(x, y, intensity);
            const mul = useLight ? lightMul : darkMul;

            WOBuffer32[idx] = packRGBA(
                (br * mul) | 0,
                (bg * mul) | 0,
                (bb * mul) | 0,
                255
            );
        }
    }
}

function drawShadowTri2D(p0, p1, p2, darkness01) {
    const x0 = p0.x, y0 = p0.y;
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;

    const area = edge(x0,y0, x1,y1, x2,y2);
    if (area === 0) return;
    const invA = 1 / area;

    const minX = Math.max(0, Math.floor(Math.min(x0,x1,x2)));
    const maxX = Math.min(canvasWidth-1, Math.ceil (Math.max(x0,x1,x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0,y1,y2)));
    const maxY = Math.min(canvasHeight-1, Math.ceil (Math.max(y0,y1,y2)));

    // darkness01: 0..1 (higher = darker = more pixels drawn)
    darkness01 = clamp(darkness01, 0, 1);

    for (let y=minY; y<=maxY; y++) {
        for (let x=minX; x<=maxX; x++) {
            const px = x + 0.5, py = y + 0.5;

            const w0 = edge(x1,y1, x2,y2, px,py) * invA;
            const w1 = edge(x2,y2, x0,y0, px,py) * invA;
            const w2 = 1 - w0 - w1;

            const inside =
                (w0 >= 0 && w1 >= 0 && w2 >= 0) ||
                (w0 <= 0 && w1 <= 0 && w2 <= 0);
            if (!inside) continue;

            // ordered dither as alpha substitute
            if (!dither4x4(x, y, darkness01)) continue;

            const idx = y * canvasWidth + x;

            // write shadow to world buffer
            WOBuffer32[idx] = packRGBA(10, 10, 14, 255);
        }
    }
}


const fovPx = 260;
const cx = canvasWidth * 0.5;
const cy = canvasHeight * 0.5;



///////////////////////// Draw Pre-backed meshes //////////////////////////

function drawShip() {
    const shipWorldBase = v3(cam.x, cam.height, cam.z + ship.toCamDist);

    for (let i = 0; i < shipTris.length; i++) {
        const [a, b, c] = shipTris[i];

        // model -> world (ship local)
        const wa = v3Add(modelToWorld(shipVerts[a], ship), shipWorldBase);
        const wb = v3Add(modelToWorld(shipVerts[b], ship), shipWorldBase);
        const wc = v3Add(modelToWorld(shipVerts[c], ship), shipWorldBase);

        // world -> camera
        const ca = worldToCamera(wa, cam);
        const cb = worldToCamera(wb, cam);
        const cc = worldToCamera(wc, cam);

        // Camera space flat normal
        const e1 = v3Sub(cb, ca);
        const e2 = v3Sub(cc, ca);
        let n = v3Normalize(v3Cross(e1, e2));

        const lightDir = v3(0, 1, 0);

        // Lambert + ambient
        const ambient = 0.5;
        let ndl = clamp(v3Dot(n, lightDir), 0, 1);
        const intensity = ambient + (1 - ambient) * ndl;

        // near clip
        if (ca.z <= 0.2 || cb.z <= 0.2 || cc.z <= 0.2) continue;

        // project
        const pa = project3D(ca);
        const pb = project3D(cb);
        const pc = project3D(cc);

        // draw
        drawTriZ_Shaded(pa, pb, pc, shipTriColors[i], intensity);
    }
}

function drawShipShadowScaled() {
    const groundY = 0.0;

    const shipWorldBase = v3(cam.x, cam.height, cam.z + ship.toCamDist - 4);

    const shipWorldCenter = v3(
        shipWorldBase.x,
        shipWorldBase.y + ship.pos.y,
        shipWorldBase.z + ship.pos.z
    );
    const shadowCenterWorld = v3(shipWorldCenter.x, groundY, shipWorldCenter.z);

    const cc = worldToCamera(shadowCenterWorld, cam);
    if (cc.z <= 0.2) return;

    const pc = project3D(cc);
    const ax = pc.x, ay = pc.y;

    const h = shipWorldCenter.y - groundY;

    let s = 1.0 / (1.0 + h * 0.1);     // 0.12 to 0.30 best
    s = clamp(s, 0.8, 1.0);            // CLAMP!

    // Shrinkification fasctor 
    s *= 0.75;

    // darkness based on height
    const darkness = clamp(1.0 - h * 0.12, 0.25, 0.85);

    for (let i = 0; i < shipTris.length; i++) {
        const [a,b,c] = shipTris[i];

        // model -> world
        const wa = v3Add(modelToWorld(shipVerts[a], ship), shipWorldBase);
        const wb = v3Add(modelToWorld(shipVerts[b], ship), shipWorldBase);
        const wc = v3Add(modelToWorld(shipVerts[c], ship), shipWorldBase);

        // drop onto ground
        const swa = v3(wa.x, groundY, wa.z);
        const swb = v3(wb.x, groundY, wb.z);
        const swc = v3(wc.x, groundY, wc.z);

        // world -> camera
        const ca = worldToCamera(swa, cam);
        const cb = worldToCamera(swb, cam);
        const cc2 = worldToCamera(swc, cam);

        if (ca.z <= 0.2 || cb.z <= 0.2 || cc2.z <= 0.2) continue;

        // project
        let pa = project3D(ca);
        let pb = project3D(cb);
        let pc2 = project3D(cc2);

        // *** shrink around anchor ***
        pa = scale2DAbout(pa, ax, ay, s);
        pb = scale2DAbout(pb, ax, ay, s);
        pc2 = scale2DAbout(pc2, ax, ay, s);

        drawShadowTri2D(pa, pb, pc2, darkness);
    }
}

function drawBoxObstacle(o) {
    const hx = o.half.x, hy = o.half.y, hz = o.half.z;

    for (let i = 0; i < boxTris.length; i++) {
        const [a,b,c] = boxTris[i];

        const va = boxVerts[a], vb = boxVerts[b], vc = boxVerts[c];

        // model->world (scale by half-extents + translate by pos)
        const wa = v3(o.pos.x + va.x*hx, o.pos.y + va.y*hy, o.pos.z + va.z*hz);
        const wb = v3(o.pos.x + vb.x*hx, o.pos.y + vb.y*hy, o.pos.z + vb.z*hz);
        const wc = v3(o.pos.x + vc.x*hx, o.pos.y + vc.y*hy, o.pos.z + vc.z*hz);

        const ca = worldToCamera(wa, cam);
        const cb = worldToCamera(wb, cam);
        const cc = worldToCamera(wc, cam);

        if (ca.z <= 0.2 || cb.z <= 0.2 || cc.z <= 0.2) continue;

        const e1 = v3Sub(cb, ca);
        const e2 = v3Sub(cc, ca);
        const n  = v3Normalize(v3Cross(e1, e2));
        const lightDir = v3(0, 1, 0);
        const ambient = 0.25;
        const intensity = ambient + (1 - ambient) * clamp(v3Dot(n, lightDir), 0, 1);

        const pa = project3D(ca);
        const pb = project3D(cb);
        const pc = project3D(cc);

        drawTriZ_Shaded(pa, pb, pc, o.color, intensity);
    }
}

function drawObstacles() {
    for (let i = 0; i < obstacles.length; i++) drawBoxObstacle(obstacles[i]);
}


///////////////////////// Gameplay functionality //////////////////////////

const obstacles = [];

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

/////////////////////// Updates and Draw to Canvas ////////////////////////

function compositeBuffers() {
    // BG + World
    for (let i = 0; i < FinalImage32.length; i++) {
        const w = WOBuffer32[i];
        const a = w >>> 24;  // alpha byte
        FinalImage32[i] = (a !== 0) ? w : BGBuffer32[i];
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

    // Move forward (always straight ahead)
    console.log((ship.pos.x));
    //(ship.pos.x / 10) !!!ADD THIS TO CAMERA TO PAN IT WITH THE SHIP!!!
    cam.x += (ship.pos.x / 10) * cam.speed * deltaTime;
    ship.pos.x -= (ship.pos.x / 10) * cam.speed * deltaTime;
    cam.z += 1 * cam.speed * deltaTime;
}

function updateShip(deltaTime) {
    const horizontalSpeed = 75.0;
    const verticalSpeed = 75.0;
    const horizontalDamping = 0.85;

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


    
    // Rolling rolling rolling
    if(KeyPressed("KeyQ")) startBarrellRoll(-1);
    if(KeyPressed("KeyE")) startBarrellRoll(1);

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
    const deltaTime = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;

    clear32(packRGBA(0,0,0,0));
    clearZ();

    update(deltaTime);
    updateShip(deltaTime);
    maybeSpawnObstacle();
    checkCollisions();

    renderMode7();
    drawShipShadowScaled();
    drawObstacles();
    drawShip();

    cullObstacles();

    compositeBuffers();
    ctx.putImageData(img, 0, 0);

    endFrameKeys();
    requestAnimationFrame(renderFrame);
}

requestAnimationFrame(renderFrame);