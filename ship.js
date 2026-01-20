import { v3, packRGBA } from "./supMathFunc.js";
import { shipTris } from "./preBacked3D.js";

/////////////////////////// Ship State Object //////////////////////////////
export const ship = {
    //Magical transform parameters
    pos: v3(0.0, -4.0, 0.0),   // local offset relative to camera NOT WORLD POSITION!
    scale: 0.7,
    yaw: 0,
    pitch: 0,
    roll: 0,
    xVel: 0,
    yVel: 0,
    // Camera parameters
    toCamDist: 12.0,
    // Barrel roll/tilt parameters
    rollActive: false,
    rollDir: 0,
    rollT: 0,
    rollDuration: 0.55,
    rollStart: 0,
    rollEnd: 0,
    rollInvulnTime: 0,
    sideTilt: 0,
    sideTarget: 0,
    sideSpeed: 10,
    //Gameplay parameters
    Shield: 5,
    Energy: 5,
};

// Flat colours (one per triangle) – tweak as you like
export const shipTriColors = shipTris.map((_, i) => {
    // subtle variation
    const base = 200 - (i % 4) * 10;
    return packRGBA(base, base, base + 20, 255);
});

export function startBarrelRoll(dir) {
    if(ship.rollActive) return;

    ship.rollActive = true;
    ship.rollDir = dir;
    ship.rollT = 0;

    ship.xVel = dir * 40.0;
    ship.rollStart = ship.roll;
    ship.rollEnd = ship.rollStart - dir * Math.PI * 2;

    ship.rollInvulnTime = 0.45;
}
