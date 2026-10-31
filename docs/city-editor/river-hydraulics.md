# River hydraulics in the City Editor

Height-field terrain uses a steady one-dimensional rectangular-channel model. Three.js draws its sampled cross-sections. Existing documents without a height field retain the cell-based river renderer.

## Water level and cross-sections

At each sampled station, the natural terrain is sampled on both banks. The requested water level is `max(0, min(leftBank, rightBank) - River depth)`. Both sides of the water section use that same elevation, including mitered bends. The downstream water level is capped at the preceding station's level, so a fixed river course cannot pump water uphill. Where the supplied course crosses rising terrain, the channel is excavated; this model does not reroute rivers or simulate erosion.

The UI's **River depth** is bank-to-water clearance. It is separate from the physical thickness of water between the free surface and the bed.

## Steady flow

Discharge is conserved: `Q = width * depth * velocity`.

The model uses the energy head `H = waterSurface + velocity² / (2g)`, with `g = 9.80665 m/s²`. Between adjacent stations it solves:

`H_previous = waterSurface_next + velocity_next² / (2g) + length * n² * velocity_next² / R_next^(4/3)`

Here `R = width * depth / (width + 2 * depth)` is the hydraulic radius and `n = 0.035` is the default Manning roughness. The implicit downstream velocity is found by bisection; depth follows from continuity and the bed is excavated below the water surface by that depth.

FMG depth and velocity supply the upstream boundary when available. Otherwise, depth comes from the existing channel estimate and upstream velocity is estimated by Manning's equation using the reach's fall. No fall and no supplied inflow produces standing water, without a fabricated current.

This is a deterministic steady approximation. It does not implement time-dependent floods, full three-dimensional turbulence, spray, or a coupled confluence solver. The underlying energy-equation approach is described in the [HEC-RAS hydraulic reference](https://www.hec.usace.army.mil/confluence/rasdocs/ras1dtechref/6.0/theoretical-basis-for-one-dimensional-and-two-dimensional-hydrodynamic-calculations/1d-steady-flow-water-surface-profiles/equations-for-basic-profile-calculations).

## Rendering and persistence

Water is built from paired left/right station vertices rather than arbitrary triangulation of a long river polygon. Surveyed wet polygons clip the strips without changing their water planes. Buoyancy queries interpolate those same triangles. River depth changes rebuild both the water surface and the carved ground.

Profiles are derived from the saved terrain and river course; rendering never rewrites the document. No simulation buffers or sampled profiles are added to saved maps. Segment indexes bound terrain sampling work to nearby river reaches.
