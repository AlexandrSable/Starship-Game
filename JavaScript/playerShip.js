import { v3, packRGBA } from "./supportMathFuncs.js";
import { playSoundSingular, sounds} from "./main.js";

/////////////////////////// Ship State Object //////////////////////////////
export const ship = {
    //Magical transform parameters
    pos: v3(0.0, -4.0, 0.0),   // local offset relative to camera NOT WORLD POSITION!
    scale: 0.35,
    yaw: 0,
    pitch: 0,
    roll: 0,
    xVel: 0,
    yVel: 0,
    // Camera parameters
    toCamDist: 12.0,
    lightDir: v3(0, 1, 0),
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
    Score: 0,
    Shield: 5,
    ShieldMax: 5,
    Energy: 5,
    EnergyMax: 5,
    lastDamageTime: -999,  // Time since last damage
    lastEnergyUseTime: -999,  // Time since last energy use
    shieldRegenDelay: 2.0,  // Seconds before shield starts regenerating
    energyRegenDelay: 1.0,  // Seconds before energy starts regenerating
    shieldRegenRate: 3.0,   // Points per second
    energyRegenRate: 2.5,   // Points per second
};

export const idle = {
  bobAmpY: 0.1,
  bobAmpX: 0.1,
  bobHz:   0.8,

  rotAmpPitch: 0.03,
  rotAmpYaw:   0.02,
  rotAmpRoll:  0.02,
  rotHz:       0.9,
};

export function startBarrelRoll(dir) {
    if(ship.rollActive) return;
    if(ship.Energy < 1) return;  // Not enough energy

    ship.Energy -= 1;  // Consume energy
    ship.lastEnergyUseTime = 0;  // Reset energy regen timer

    playSoundSingular(sounds.fastSwoosh, 0.25);

    ship.rollActive = true;
    ship.rollDir = dir;
    ship.rollT = 0;

    ship.xVel = dir * 40.0;
    ship.rollStart = ship.roll;
    ship.rollEnd = ship.rollStart - dir * Math.PI * 2;

    ship.rollInvulnTime = 0.45;
}

export function updateShipResources(dt) {
    // Update damage/energy timers
    ship.lastDamageTime += dt;
    ship.lastEnergyUseTime += dt;

    // Shield regeneration
    if (ship.lastDamageTime >= ship.shieldRegenDelay && ship.Shield < ship.ShieldMax) {
        ship.Shield = Math.min(ship.ShieldMax, ship.Shield + ship.shieldRegenRate * dt);
    }

    // Energy regeneration
    if (ship.lastEnergyUseTime >= ship.energyRegenDelay && ship.Energy < ship.EnergyMax) {
        ship.Energy = Math.min(ship.EnergyMax, ship.Energy + ship.energyRegenRate * dt);
    }
}
