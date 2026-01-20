import {v3, v3Add, v3Sub, v3Cross, v3Dot, v3Normalize, scale2DAbout,
        packRGBA, unpackR, unpackG, unpackB, clamp, dither4x4, 
        modelToWorld, worldToCamera, project3D } from "./supMathFunc.js";

import { canvasWidth, canvasHeight, WOBuffer32, zbuf, cam, fovPx, cx, cy } from "./main.js";
import { obstacles } from "./map.js";
import { ship, shipTriColors } from "./ship.js";
import { shipVerts, shipTris, boxVerts, boxTris} from "./preBacked3D.js";

//////////////////////////// RASTERIZATION ////////////////////////////////

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
        const pa = project3D(ca, fovPx, cx, cy);
        const pb = project3D(cb, fovPx, cx, cy);
        const pc = project3D(cc, fovPx, cx, cy);

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

    const pc = project3D(cc, fovPx, cx, cy);
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
        let pa = project3D(ca, fovPx, cx, cy);
        let pb = project3D(cb, fovPx, cx, cy);
        let pc2 = project3D(cc2, fovPx, cx, cy);

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

export {
    drawShip,
    drawShipShadowScaled,
    drawObstacles
};