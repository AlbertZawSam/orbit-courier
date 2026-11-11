## [OR-001] Gravity and bodies on rails
tags: gravity, rails, orbit, planets, moons, motion, kepler
level: beginner

Planets, moons, and stations move on fixed Kepler orbits around their parents. They are not pulled by the probe, so their motion is the same every attempt. The probe, however, feels every body at once: the star, the planet you launched from, and the target moon. The nearest and heaviest body usually dominates, but far bodies still add small pulls, which is why a path can drift. Because bodies keep moving, the same launch can work at one moment and miss at another.

Try: watch where the target will be when you arrive, not where it is now.

## [OR-002] Circular orbit speed
tags: circular, orbit, speed, vcirc, velocity, mu
levels: L1, L2, L3
level: beginner

At distance r from a body with parameter mu, the speed that gives a circular orbit is the square root of mu divided by r. For example, around Kepi in level 2 (mu 30) at r = 1.5 the circular speed is about 4.47. Faster than that and the orbit stretches into an ellipse that reaches farther out. Slower and it dips closer to the body. A circular orbit keeps the same distance, so it is the easiest way to stay inside a radius band.

Try: ask Navigator for the circular speed here to get the number for the current level.

## [OR-003] Escape speed
tags: escape, speed, vesc, unbound, leave, velocity
level: beginner

Escape speed at distance r is the square root of 2 times mu divided by r, which is about 1.41 times the circular speed there. Above it the probe never falls back: it flies on in an open path. From Home's pad (r about 0.84, mu 20) escape speed is about 6.9, and the launch power limit is 7. Relative to a moon, escape speed is much lower, so a probe arriving fast will fly past it rather than orbit.

Try: when a launch leaves the map or flies past the target, lower the power a little.

## [OR-004] Orbit shapes, periapsis and apoapsis
tags: ellipse, periapsis, apoapsis, eccentricity, orbit shape
level: intermediate

A bound orbit is an ellipse. The closest point to the body is the periapsis and the farthest is the apoapsis. If they are equal the orbit is circular. The probe moves fastest at periapsis and slowest at apoapsis. If the probe's energy is above zero, the path is open and has no apoapsis: it escapes. The preview reports the orbit it would settle into, so you can check the periapsis stays above the body's surface.

Try: if the periapsis is below the surface the path will crash; raise it with a burn on the far side of the orbit.

## [OR-005] Orbital period
tags: period, orbit, time, hold, seconds, lap
levels: L2, L3
level: intermediate

The time for one lap of a circular orbit of radius r is 2 pi times the square root of r cubed divided by mu. Around Kepi in level 2 (mu 30) at r = 1.5 one lap takes about 2.1 seconds, so holding the band for 6 seconds is about three laps. Closer orbits are faster and farther orbits slower. Knowing the period helps you judge whether a hold time is realistic and when the probe will next pass the same point.

Try: ask Navigator for the period at the radius you plan to orbit.

## [OR-006] Prograde, retrograde and radial
tags: prograde, retrograde, radial, direction, burn, axes
level: beginner

Burn directions are measured against the probe's velocity relative to the body that pulls on it most. Prograde is along that velocity, so a prograde burn speeds you up. Retrograde is the opposite, so it slows you down. Radial is perpendicular to the velocity and points away from the body. The two handles on a selected node are the brass prograde axis and the teal radial axis. Dragging a handle backward through the node gives a retrograde burn.

Try: use prograde or retrograde to change your orbit's size, and radial to nudge its direction.
