# Campus Lite load budget

- Mobile-first hub uses a single inline SVG with hotspots; no raster hub art.
- Initial component JavaScript target: <= 28 KB before shared React/runtime code.
- Live badges render only when the D1 concurrent-presence threshold is met.
- Keyboard and screen-reader list mode must work without canvas or pointer input.
- No blocking network request is required for the default hub shell.
