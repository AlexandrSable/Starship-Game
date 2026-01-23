//////////////////////////// sRasterizer.js ////////////////////////////////
// Software Rasterizer functions for Starship Game
// I could have reused rasterization function to draw different 
// meshed with a single function, but it was a bit easier to do it
// separately for clarity (it was easier for me this way).
//
// By Alexandr Soboliev (mostly)
////////////////////////////////////////////////////////////////////////////


import {v3, v3Add, v3Sub, v3Cross, v3Dot, v3Normalize, scale2DAbout,
        packRGBA, unpackR, unpackG, unpackB, clamp, dither4x4, 
        modelToWorld, worldToCamera, project3D, avg3Color, magicalUnpackAll, blink01} from "./supportMathFuncs.js";

import { canvasWidth, canvasHeight, WOBuffer32, zbuf, cam, fovPx, cx, cy, projectiles, enemyShots, PROJ_COLOR} from "./main.js";
import { obstacles } from "./sceneManager.js";
import { enemies } from "./enemyManager.js";
import { ship, idle } from "./playerShip.js";
import { shipVerts, shipTris, shipVCol, boxVerts, boxTris, projVerts, projTris, enemyVerts, enemyTris, enemyVCol, turretVerts, turretTris, turretVCol } from "./preBaked3D.js";
//////////////////////////// RASTERIZATION ////////////////////////////////

/////////////////////////// Helper functions //////////////////////////////

function edge(ax, ay, bx, by, cx, cy) {
  return (cx - ax) * (by - ay) - (cy - ay) * (bx - ax);
}

///////////////////////// Basic Triangle Rasterizers ////////////////////////

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

    // darkness01: 0 -> 1 (higher = darker = more pixels drawn)
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



///////////////////////// Draw Pre-backed meshes //////////////////////////

function getShipRenderPose(timeSec) {
    const s1 = Math.sin(timeSec * Math.PI * 2 * idle.bobHz);
    const s2 = Math.sin(timeSec * Math.PI * 2 * (idle.bobHz * 1.37) + 1.2);

    // Copy current gameplay pose
    const pose = {
    pos:      v3(ship.pos.x, ship.pos.y, ship.pos.z),
    yaw:      ship.yaw,
    pitch:    ship.pitch,
    roll:     ship.roll,
    scale:    ship.scale,
    sideTilt: ship.sideTilt,
    };

    // --- position bob ---
    pose.pos.y += idle.bobAmpY * s1;
    pose.pos.x += idle.bobAmpX * s2;

    // --- otation drift ---
    const r1 = Math.sin(timeSec * Math.PI * 2 * idle.rotHz);
    const r2 = Math.sin(timeSec * Math.PI * 2 * (idle.rotHz * 1.21) + 0.7);

    pose.pitch += idle.rotAmpPitch * r1;
    pose.yaw   += idle.rotAmpYaw   * r2;

    pose.roll  += idle.rotAmpRoll  * (0.6 * r1 + 0.4 * r2);

    return pose;
}


function drawShip() {
    const shipWorldBase = v3(cam.x, cam.height, cam.z + ship.toCamDist);

    for (let i = 0; i < shipTris.length; i++) {
        const [a, b, c] = shipTris[i];
        let baseColor = packRGBA(0, 0, 0, 255);
        let intensity = 1.0;

        const timeSec = performance.now() * 0.001;
        const on = blink01(timeSec, 10); // 10 Hz toggle

        const shipPose = getShipRenderPose(timeSec);

        // model -> world (ship local)
        const wa = v3Add(modelToWorld(shipVerts[a], shipPose), shipWorldBase);
        const wb = v3Add(modelToWorld(shipVerts[b], shipPose), shipWorldBase);
        const wc = v3Add(modelToWorld(shipVerts[c], shipPose), shipWorldBase);

        // world -> camera
        const ca = worldToCamera(wa, cam);
        const cb = worldToCamera(wb, cam);
        const cc = worldToCamera(wc, cam);

        // Camera space flat normal
        const e1 = v3Sub(cb, ca);
        const e2 = v3Sub(cc, ca);
        let n = v3Normalize(v3Cross(e1, e2));

        // Lambert + ambient
        const ambient = 0.5;
        let ndl = clamp(v3Dot(n, ship.lightDir), 0, 1);
        if( magicalUnpackAll(shipVCol[a]).r < 10 && 
        magicalUnpackAll(shipVCol[a]).g >= 240 && 
        magicalUnpackAll(shipVCol[a]).b >= 240)
        {
            intensity = 1.0;
        }
        else intensity = ambient + (1 - ambient) * ndl; 

        // near clip
        if (ca.z <= 0.2 || cb.z <= 0.2 || cc.z <= 0.2) continue;

        // project
        const pa = project3D(ca, fovPx, cx, cy);
        const pb = project3D(cb, fovPx, cx, cy);
        const pc = project3D(cc, fovPx, cx, cy);

        if( magicalUnpackAll(shipVCol[a]).r < 10   && 
            magicalUnpackAll(shipVCol[a]).g >= 240 && 
            magicalUnpackAll(shipVCol[a]).b >= 240)
        {
            baseColor = on ? packRGBA(60, 220, 255, 255) : packRGBA(255, 90, 40, 255);
        }
        else 
        {
            baseColor = avg3Color(shipVCol[a], shipVCol[b], shipVCol[c]);
        }

        // draw
        drawTriZ_Shaded(pa, pb, pc, baseColor, intensity);
    }
}

function drawShipShadowScaled() {
    const groundY = 0.0;

    const timeSec = performance.now() * 0.001;
    const shipPose = getShipRenderPose(timeSec);

    const shipWorldBase = v3(cam.x, cam.height, cam.z + ship.toCamDist - 4);

    const shipWorldCenter = v3(
        shipWorldBase.x,
        shipWorldBase.y + ship.pos.y,
        shipWorldBase.z + ship.pos.z
    );
    const shadowCenterWorld = v3(shipWorldCenter.x, groundY, shipWorldCenter.z);

    const cc = worldToCamera(shadowCenterWorld, cam);
    if (cc.z <= 0.2) return;

    const pc = project3D(cc, fovPx, cx, cy);
    const ax = pc.x, ay = pc.y;

    const h = shipWorldCenter.y - groundY;

    let s = 1.0 / (1.0 + h * 0.1);
    s = clamp(s, 0.8, 1.0);            // CLAMP!

    // Shrinkification fasctor 
    s *= 0.75;

    // darkness based on height
    const darkness = clamp(1.0 - h * 0.12, 0.25, 0.85);

    for (let i = 0; i < shipTris.length; i++) {
        const [a,b,c] = shipTris[i];

        // model -> world
        const wa = v3Add(modelToWorld(shipVerts[a], shipPose), shipWorldBase);
        const wb = v3Add(modelToWorld(shipVerts[b], shipPose), shipWorldBase);
        const wc = v3Add(modelToWorld(shipVerts[c], shipPose), shipWorldBase);

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
        let pa = project3D(ca, fovPx, cx, cy);
        let pb = project3D(cb, fovPx, cx, cy);
        let pc2 = project3D(cc2, fovPx, cx, cy);

        // --- shrink around anchor ---
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
        const lightDir = v3(0, 0, -1);
        const ambient = 0.25;
        const intensity = ambient + (1 - ambient) * clamp(v3Dot(n, lightDir), 0, 1);

        const pa = project3D(ca, fovPx, cx, cy);
        const pb = project3D(cb, fovPx, cx, cy);
        const pc = project3D(cc, fovPx, cx, cy);

        drawTriZ_Shaded(pa, pb, pc, o.color, intensity);
    }
}

function drawObstacles() {
    for (let i = 0; i < obstacles.length; i++) drawBoxObstacle(obstacles[i]);
}

function drawProjectiles() {
    // Draw player projectiles with blue color
    drawProjectileList(projectiles, PROJ_COLOR);
    // Draw enemy projectiles with orange color 
    drawProjectileList(enemyShots, packRGBA(255, 130, 60, 255));
}

function drawProjectileList(projectileList, color) {
    for (const pr of projectileList) {
        for (let i = 0; i < projTris.length; i++) {
            const [a,b,c] = projTris[i];

            // model -> world
            const wa = modelToWorld(projVerts[a], pr);
            const wb = modelToWorld(projVerts[b], pr);
            const wc = modelToWorld(projVerts[c], pr);

            // world -> camera
            const ca = worldToCamera(wa, cam);
            const cb = worldToCamera(wb, cam);
            const cc = worldToCamera(wc, cam);

            if (ca.z <= 0.2 || cb.z <= 0.2 || cc.z <= 0.2) continue;

            const pa = project3D(ca, fovPx, cx, cy);
            const pb = project3D(cb, fovPx, cx, cy);
            const pc = project3D(cc, fovPx, cx, cy);

            // Use simple lighting - face toward camera
            const n = v3Normalize(v3Cross(v3Sub(cb, ca), v3Sub(cc, ca)));
            const camDir = v3Normalize(ca);
            const light = Math.max(1.0, v3Dot(n, camDir));  // 100% BRIGHTNESS!!!

            // Draw with brightness
            drawTriZ_Shaded(pa, pb, pc, color, light);
        }
    }
}

function drawDrone(e) {
    for (let i = 0; i < enemyTris.length; i++) {
        const [a,b,c] = enemyTris[i];

        // Use e.scale property 
        const wa = modelToWorld(enemyVerts[a], e);
        const wb = modelToWorld(enemyVerts[b], e);
        const wc = modelToWorld(enemyVerts[c], e);

        // world -> camera
        const ca = worldToCamera(wa, cam);
        const cb = worldToCamera(wb, cam);
        const cc = worldToCamera(wc, cam);

        if (ca.z <= 0.2 || cb.z <= 0.2 || cc.z <= 0.2) continue;

        // project
        const pa = project3D(ca, fovPx, cx, cy);
        const pb = project3D(cb, fovPx, cx, cy);
        const pc = project3D(cc, fovPx, cx, cy);

        // lighting
        const e1 = v3Sub(cb, ca);
        const e2 = v3Sub(cc, ca);
        const n = v3Normalize(v3Cross(e1, e2));
        const lightDir = v3(0, 1, 0);
        const ambient = 0.4;
        const intensity = ambient + (1 - ambient) * clamp(v3Dot(n, lightDir), 0, 1);

        const baseColor = avg3Color(enemyVCol[a], enemyVCol[b], enemyVCol[c]);
        drawTriZ_Shaded(pa, pb, pc, baseColor, intensity);
    }
}

function drawTurret(e) {
    const turretScale = 6.5;  // Scale multiplier for turret mesh
    for (let i = 0; i < turretTris.length; i++) {
        let baseColor = packRGBA(0, 0, 0, 255);
        const [a,b,c] = turretTris[i];

        const timeSec = performance.now() * 0.001;
        const on = blink01(timeSec, 10); // 10 Hz toggle

        // Scale vertices and apply model -> world
        const scaledA = v3(turretVerts[a].x * turretScale, turretVerts[a].y * turretScale, turretVerts[a].z * turretScale);
        const scaledB = v3(turretVerts[b].x * turretScale, turretVerts[b].y * turretScale, turretVerts[b].z * turretScale);
        const scaledC = v3(turretVerts[c].x * turretScale, turretVerts[c].y * turretScale, turretVerts[c].z * turretScale);

        // model -> World 
        const wa = modelToWorld(scaledA, e);
        const wb = modelToWorld(scaledB, e);
        const wc = modelToWorld(scaledC, e);

        // world -> camera
        const ca = worldToCamera(wa, cam);
        const cb = worldToCamera(wb, cam);
        const cc = worldToCamera(wc, cam);

        if (ca.z <= 0.2 || cb.z <= 0.2 || cc.z <= 0.2) continue;

        // project
        const pa = project3D(ca, fovPx, cx, cy);
        const pb = project3D(cb, fovPx, cx, cy);
        const pc = project3D(cc, fovPx, cx, cy);

        // lighting
        const e1 = v3Sub(cb, ca);
        const e2 = v3Sub(cc, ca);
        const n = v3Normalize(v3Cross(e1, e2));
        const lightDir = v3(0, 1, 0);
        const ambient = 0.4;
        const intensity = ambient + (1 - ambient) * clamp(v3Dot(n, lightDir), 0, 1);

        if( magicalUnpackAll(turretVCol[a]).r < 10   && 
            magicalUnpackAll(turretVCol[a]).g >= 240 && 
            magicalUnpackAll(turretVCol[a]).b >= 240)
        {
            baseColor = on ? packRGBA(60, 220, 255, 255) : packRGBA(255, 90, 40, 255);
        }
        else 
        {
            baseColor = avg3Color(turretVCol[a], turretVCol[b], turretVCol[c]);
        }

        drawTriZ_Shaded(pa, pb, pc, baseColor, intensity);
    }
}

function drawEnemies(drawBoxFn) {
    for (const e of enemies) {
        if (e.type === "drone") {
            drawDrone(e);
        } else if (e.type === "turret") {
            drawTurret(e);
        } else {
            drawBoxFn(e);
        }
    }
}


export {
    drawShip,
    drawShipShadowScaled,
    drawObstacles,
    drawProjectiles,
    drawBoxObstacle,
    drawEnemies
};