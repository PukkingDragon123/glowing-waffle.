// Apartment 1407 floor plan, shared by the gameplay scene and every cinematic.
// Metres. Floor at y=0. Room interior x ∈ [-3.2, 3.2], z ∈ [-2.3, 2.3], ceiling 2.65.
// The camera normally looks in from the open front (+z) like a dollhouse; cinematics may show the
// front wall and ceiling. Character yaw: 0 faces +Z, π/2 faces +X, -π/2 faces -X, π faces -Z.
export const ROOM = { x0: -3.2, x1: 3.2, z0: -2.3, z1: 2.3, h: 2.65, wall: 0.12 };

export const OPENINGS = {
  window: { wall: 'back', x0: -1.4, x1: 0.8, y0: 0.85, y1: 2.35 },          // the city is outside
  door: { wall: 'east', z0: 0.85, z1: 1.75, h: 2.1, hinge: 'z1' },          // entrance (soldiers come in here)
  bathroom: { wall: 'back', x0: -2.45, x1: -1.75, h: 2.05 },                // closed; things knock in there
};

// Furniture footprints (center x,z; size w (x) × d (z); yaw). Used for nav-blocking and placement.
export const FURNITURE = {
  counter: { x: -2.9, z: -1.5, w: 0.6, d: 1.6, h: 0.9 },     // stove at z=-1.85, sink at z=-1.05
  fridgeGhost: { x: -2.92, z: -0.42, w: 0.6, d: 0.62 },        // where the seized fridge stood
  sofa: { x: -2.72, z: 1.25, w: 0.9, d: 1.9, h: 0.85 },
  sideTable: { x: -2.92, z: 0.1, w: 0.45, d: 0.45, h: 0.55 },  // pink radio
  coffeeTable: { x: -1.75, z: 1.25, w: 0.55, d: 1.0, h: 0.42 },
  rug: { x: -1.85, z: 1.25, w: 2.0, d: 2.2 },
  tv: { x: -0.55, z: 1.25, w: 0.55, d: 0.9, h: 0.5, yaw: -Math.PI / 2 }, // small CRT on a low cabinet, faces the sofa
  shelf: { x: 1.45, z: -2.08, w: 0.92, d: 0.4, h: 1.85 },     // the noodle shelf
  desk: { x: 2.88, z: -0.55, w: 0.65, d: 1.4, h: 0.74 },      // computer desk, monitor faces -x
  chair: { x: 2.1, z: -0.55, w: 0.55, d: 0.55 },
  crib: { x: 2.65, z: -1.98, w: 1.0, d: 0.56, h: 0.95 },      // placed during the Day 1 rebuild
  lamp: { x: -2.95, z: 2.1, w: 0.35, d: 0.35, h: 1.6 },
  plant: { x: -1.6, z: -2.0, w: 0.4, d: 0.4 },
};

// Where Sunny (or anyone) stands to use things: pos [x,0,z], yaw.
export const SPOTS = {
  stove: { pos: [-2.25, 0, -1.85], yaw: -Math.PI / 2 },
  sink: { pos: [-2.25, 0, -1.05], yaw: -Math.PI / 2 },
  shelf: { pos: [1.45, 0, -1.45], yaw: Math.PI },
  desk: { pos: [2.12, 0, -0.55], yaw: Math.PI / 2 },          // seated in the chair
  sofa: { pos: [-2.5, 0, 1.25], yaw: Math.PI / 2 },           // seated
  sofaLie: { pos: [-2.72, 0.45, 1.25], yaw: 0 },
  crib: { pos: [2.6, 0, -1.3], yaw: Math.PI },
  door: { pos: [2.45, 0, 1.3], yaw: Math.PI / 2 },
  doorOutside: { pos: [4.2, 0, 1.3], yaw: Math.PI / 2 },      // the corridor beyond the door
  window: { pos: [-0.3, 0, -1.65], yaw: Math.PI },
  center: { pos: [0.3, 0, 0.5], yaw: 0 },
  tv: { pos: [-1.2, 0, 1.25], yaw: Math.PI / 2 },
  radio: { pos: [-2.45, 0, 0.1], yaw: -Math.PI / 2 },
  catBowl: { pos: [-2.2, 0, -0.2], yaw: -Math.PI / 2 },
};

// Camera presets for the gameplay view and object close-ups ({ pos, look, fov }).
export const CAMS = {
  overview: { pos: [0.15, 5.0, 7.6], look: [0.0, 0.85, -0.25], fov: 38 },
  kitchen: { pos: [-0.9, 2.1, -0.4], look: [-2.9, 1.0, -1.45], fov: 42 },
  stove: { pos: [-1.95, 1.75, -1.85], look: [-2.95, 0.92, -1.85], fov: 40 },
  shelf: { pos: [1.45, 1.25, -0.7], look: [1.45, 1.0, -2.1], fov: 48 },
  desk: { pos: [1.95, 1.32, -0.55], look: [3.1, 1.08, -0.55], fov: 36 },
  sofa: { pos: [-0.4, 1.6, 2.6], look: [-2.6, 0.8, 1.1], fov: 42 },
  crib: { pos: [1.75, 1.8, -0.7], look: [2.65, 0.7, -1.98], fov: 45 },
  window: { pos: [0.2, 1.55, 0.6], look: [-0.3, 1.6, -3.0], fov: 50 },
  door: { pos: [0.6, 1.6, 2.1], look: [3.1, 1.1, 1.3], fov: 48 },
};

export const GROUND_FLOOR = 14; // storeys below room 1407: the window looks out from ~44 m up
