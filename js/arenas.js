// Battle arenas added after the original rotation. Platform coordinates are
// left edge, top, width in world units. Movers use the shared sim clock.
const ledge = (x, y, w, move) => move ? { x, y, w, move } : { x, y, w };

function arena(name, size, width, plats, respawnY, hazards) {
  const half = width / 2;
  const limit = half + 780;
  return {
    name, size, main: { x: -half, y: 0, w: width, h: 46 }, plats,
    blast: { l: -limit, r: limit, t: respawnY - 630, b: size === 'large' ? 550 : 500 },
    spawns: [-0.7, 0.7, -0.24, 0.24].map(fraction => Math.round(half * fraction)),
    respawnY, ...(hazards && { hazards }),
  };
}

export const ARENAS = {
  // Small
  needledrop: arena('Needle Drop', 'small', 560, [
    ledge(-95, -118, 190, { dx: 168, period: 6 }),
  ], -292),
  belfry: arena('Midnight Belfry', 'small', 510, [
    ledge(-225, -118, 130), ledge(-165, -252, 130), ledge(-65, -375, 135),
    ledge(80, -188, 115, { dy: 132, period: 7.8 }),
  ], -460),
  koicrossing: arena('Koi Crossing', 'small', 680, [
    ledge(-324, -85, 96), ledge(-142, -135, 100), ledge(44, -135, 100), ledge(228, -85, 96),
  ], -292),
  mothmill: arena('Mothlight Mill', 'small', 620, [
    ledge(-335, -117, 165), ledge(-120, -240, 240),
    ledge(150, -153, 130, { dx: 46, dy: -65, period: 6.8 }),
  ], -350),
  pocketplanet: arena('Pocket Planet', 'small', 480, [
    ledge(-264, -150, 120, { dx: 72, dy: 75, period: 8 }),
    ledge(144, -150, 120, { dx: 72, dy: 75, period: 8, phase: 4 }),
    ledge(-50, -274, 100),
  ], -365),
  lastscoop: arena('The Last Scoop', 'small', 640, [
    ledge(-285, -92, 185), ledge(-123, -195, 150), ledge(12, -295, 112), ledge(114, -390, 85),
  ], -480),

  // Medium
  switchback: arena('Switchback Express', 'medium', 1020, [
    ledge(-475, -86, 180), ledge(273, -290, 205), ledge(110, -420, 165),
    ledge(-105, -186, 210, { dx: 165, dy: -100, period: 10 }),
  ], -495),
  glasshouse: arena('Glasshouse Tide', 'medium', 850, [
    ledge(-454, -128, 170, { dy: 65, period: 9 }),
    ledge(-208, -168, 155, { dy: 78, period: 9, phase: 2.25 }),
    ledge(50, -168, 155, { dy: 78, period: 9, phase: 4.5 }),
    ledge(282, -128, 170, { dy: 65, period: 9, phase: 6.75 }),
  ], -350),
  parade: arena('Lantern Parade', 'medium', 970, [
    ledge(-415, -104, 310), ledge(105, -104, 310),
    ledge(-65, -225, 130, { dx: 280, period: 12 }), ledge(-200, -355, 400),
  ], -450),
  deadair: arena('Dead Air FM', 'medium', 940, [
    ledge(-450, -112, 210), ledge(-343, -245, 166), ledge(-250, -375, 105),
    ledge(82, -118, 355),
  ], -462),
  pinball: arena('Pinball Palace', 'medium', 890, [
    ledge(-410, -176, 125, { dy: 110, period: 5.6 }),
    ledge(285, -176, 125, { dy: 110, period: 5.6, phase: 2.8 }),
    ledge(-170, -235, 100), ledge(70, -235, 100), ledge(-70, -110, 140),
  ], -365),
  saltworks: arena('The Salt Works', 'medium', 1080, [
    ledge(-535, -100, 240), ledge(295, -100, 240),
    ledge(-200, -185, 400),
  ], -325),

  // Large
  whalefall: arena('Whalefall Cathedral', 'large', 1620, [
    ledge(-780, -120, 190), ledge(-570, -250, 170), ledge(-360, -375, 155),
    ledge(-110, -495, 220), ledge(205, -375, 155), ledge(400, -250, 170), ledge(590, -120, 190),
  ], -590),
  kitearmada: arena('Kite Armada', 'large', 1580, [
    ledge(-765, -108, 260), ledge(505, -108, 260),
    ledge(-540, -225, 180, { dx: 106, dy: -50, period: 9 }),
    ledge(360, -225, 180, { dx: 106, dy: -50, period: 9, phase: 4.5 }),
    ledge(-270, -338, 200), ledge(70, -338, 200),
    ledge(-105, -465, 210, { dx: 160, period: 11 }),
  ], -565),
  sleepercircuit: arena('Sleeper Circuit', 'large', 1800, [
    ledge(-860, -115, 290), ledge(570, -115, 290),
    ledge(-114, -115, 228, { dx: 432, period: 7.8 }),
    ledge(-150, -247, 300, { dx: 480, period: 7.8, phase: 3.9 }),
  ], -360),
  caldera: arena('Caldera Choir', 'large', 1660, [
    ledge(-715, -102, 210), ledge(-470, -220, 188), ledge(-245, -335, 162),
    ledge(80, -335, 162), ledge(282, -220, 188), ledge(505, -102, 210),
  ], -465, [
    { x: -457, w: 80, h: 260, period: 12, phase: 0, warn: 1.8, act: 0.9 },
    { x: -53, w: 106, h: 360, period: 12, phase: 4, warn: 1.8, act: 0.9 },
    { x: 377, w: 80, h: 260, period: 12, phase: 8, warn: 1.8, act: 0.9 },
  ]),
  papersea: arena('The Paper Sea', 'large', 1520, [
    ledge(-830, -86, 240), ledge(-570, -198, 260), ledge(-295, -305, 305),
    ledge(88, -132, 366), ledge(500, -238, 245),
    ledge(70, -380, 180, { dx: 70, dy: 44, period: 10 }),
  ], -485),
  eclipse: arena('Eclipse Elevator', 'large', 1450, [
    ledge(-625, -120, 290), ledge(335, -120, 290),
    ledge(-312, -215, 150, { dy: 134, period: 9 }),
    ledge(162, -365, 150, { dy: 134, period: 9, phase: 4.5 }),
    ledge(-98, -270, 196), ledge(-410, -465, 205), ledge(205, -570, 205),
    ledge(-72, -685, 144),
  ], -770),
};
