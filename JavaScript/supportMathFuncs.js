///////////////////////////////////////////////////////////////////////////
//  supMathFunc.js
//  Supporting Math functions for Starship Game
//  By Alexandr Soboliev, 2026
////////////////////////// Simple math functions //////////////////////////

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp =  (a, b, t) => a + (b - a) * t;
function scale2DAbout(p, ax, ay, s) {
    return { x: ax + (p.x - ax) * s, y: ay + (p.y - ay) * s, z: p.z };
}
function approachAngle(current, target, maxStep) {
    // Normalize the difference to [-π, π] for shortest path
    let d = target - current;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) <= maxStep) return target;
    return current + Math.sign(d) * maxStep;
}
function blink01(t, hz = 8) {
  // returns 0 or 1 based on time
  return ((t * hz) | 0) & 1;
}
//////////////////// Color & Basic Shading functions //////////////////////

function packRGBA(r, g, b, a = 255) {
    return (a << 24) | (b << 16) | (g << 8) | r;
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

function magicalUnpackAll(c)
{
    return {
        r: c & 255,
        g: (c >> 8) & 255,
        b: (c >> 16) & 255,
        a: (c >> 24) & 255
    };
}

function avg3Color(c0, c1, c2) {
    const r = ((c0 & 255) + (c1 & 255) + (c2 & 255)) / 3;
    const g = (((c0 >> 8) & 255) + ((c1 >> 8) & 255) + ((c2 >> 8) & 255)) / 3;
    const b = (((c0 >> 16) & 255) + ((c1 >> 16) & 255) + ((c2 >> 16) & 255)) / 3;
    return packRGBA(r|0, g|0, b|0, 255);
}

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
function project3D(p, fovPx, cx, cy) {
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
    r = rotateZ(r, ship.roll + ship.sideTilt);
    r = rotateX(r, ship.pitch);
    r = rotateY(r, ship.yaw);
    return v3Add(r, ship.pos);
}

/////////////////////// Enemy related functions ///////////////////////////

function aimAngles(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;

    // yaw: rotate around Y to face target in XZ plane
    const yaw = Math.atan2(dx, dz);

    // pitch: rotate around X to face target in YZ plane
    const distXZ = Math.hypot(dx, dz) || 1e-6;
    const pitch = Math.atan2(dy, distXZ);

    return { yaw, pitch };
}

export { clamp, lerp, scale2DAbout, packRGBA, dither4x4,
         unpackR, unpackG, unpackB,
         v3, v3Add, v3Sub, v3Scale, v3Dot, v3Cross, v3Normalize,
         project3D, rotateX, rotateY, rotateZ,
         worldToCamera, modelToWorld, avg3Color, magicalUnpackAll, blink01, approachAngle, aimAngles };