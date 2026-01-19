///////////////////////////////////////////////////////////////
// Explanation thing
///////////////////////////////////////////////////////////////

const canvas = document.getElementById("FinalRender");
const ctx = canvas.getContext("2d", { alpha: false });

const canvasWidth = canvas.width
const canvasHeight = canvas.height;

const img = ctx.createImageData(canvasWidth, canvasHeight);

const FinalImage32  = new Uint32Array(img.data.buffer);
const BGBuffer32    = new Uint32Array(canvasWidth * canvasHeight);
const WOBuffer32    = new Uint32Array(canvasWidth * canvasHeight);
const UIBuffer32    = new Uint32Array(canvasWidth * canvasHeight);

////////////////////// UTILITY FUNCTIONS //////////////////////

function packRGBA(r, g, b, a = 255) {
    return (a << 24) | (b << 16) | (g << 8) | r;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

////////////////// Procedural Ground Texture //////////////////

const TEX = 256;
const tex = new Uint32Array(TEX * TEX);
for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
        const gx = (x & 31) === 0;
        const gy = (y & 31) === 0;
        const checker = ((x >> 0.1) ^ (y >> 0.1)) & 1;

        let r = 20, g = 140, b = 120;
        if (checker) { r += 10; g += 10; b += 10; }
        if (gx || gy) { r = 230; g = 240; b = 255; }
        tex[y * TEX + x] = packRGBA(r, g, b, 255);
    }
}

///////////////////////////////////////////////////////////////

// ---- input ----
const keys = new Set();
window.addEventListener("keydown"   , (e) => keys.add(e.code));
window.addEventListener("keyup"     , (e) => keys.delete(e.code));

// ---- camera ----
const cam = {
    x: 0,
    z: 0,
    pitch: 0,
    roll: 0,
    height: 5.0,   
    speed: 6.0,
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

    const scale = 140;
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
    cam.x += 0 * cam.speed * deltaTime;
    cam.z += 1 * cam.speed * deltaTime;
}

function renderFrame(t) {
    const deltaTime = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;

    update(deltaTime);
    renderMode7();
    compositeBuffers();
    ctx.putImageData(img, 0, 0);

    requestAnimationFrame(renderFrame);
}

requestAnimationFrame(renderFrame);