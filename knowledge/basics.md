## [BA-001] Controls at a glance
tags: controls, keys, aim, launch, keyboard, mouse
level: beginner

Drag from the launch planet to aim: the direction sets the launch angle and the drag length sets the power. The arrow keys also aim (left and right turn, up and down change power; hold Shift for fine steps). Press Enter or Space to launch, R to reset and retry, S for slow motion, N to add a burn node, Tab to select a node, Delete to remove it, and the mouse wheel to zoom. Press H to open Navigator.

Try: aim with a drag, then fine-tune with Shift and the arrow keys while watching the preview line.

## [BA-002] Units and mu
tags: units, mu, gravity, physics, simplified, game units
level: beginner

This game uses simplified physics in game units, not real ones. The gravitational constant is 1, so a body's mu equals its mass, and the pull it exerts at distance r is mu divided by r squared. Distances are in game units and speeds are in units per second. Everything in these guides describes the game's own physics. Heavier bodies have a larger mu: in the early levels Home has mu 20, Kepi has mu 14 or 30, and the star Sol has mu 1000.

Try: open a calculator question, such as asking for the circular speed here, to see mu used in real numbers.

## [BA-003] Reading the preview line
tags: preview, trajectory, path, crash marker, prediction, line
level: beginner

The preview shows where the probe will go over the next 15 seconds. It is not an estimate: it uses the same physics step as the real flight, so a launch follows its preview exactly, including burn nodes. A teal line means the path is safe. An orange line with a ring means the path ends in a crash, and the ring marks where. The preview updates every time you change the aim or a node, and during flight it restarts from the probe's current position.

Try: change one thing at a time and watch how the line moves before you commit to a launch.

## [BA-004] Fuel and delta-v
tags: fuel, delta-v, dv, burn, cost, tank, budget
level: beginner

Launching is free. Only burn nodes cost fuel, and a burn costs exactly its delta-v, which is the length of its change in velocity: the square root of prograde squared plus radial squared. The total of all burns cannot exceed the level's tank, and the game scales a drag down to what is left. Running out of fuel is not a failure, because the probe simply coasts. Par fuel is what the designer's solution used, and finishing at or below par earns three stars.

Try: look for a plan with fewer or smaller burns before adding more.
