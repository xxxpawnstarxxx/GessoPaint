# GessoPaint — Forma 3D Studio

A tactile 3D painting studio with pressure-aware brushes, beautiful colors, layers, and GLB import/export.

**Formerly titled "Forma — A new dimension of painting"**

> Your ideas, in a new dimension.

## Features

- **3D Painting Engine** — Paint directly on 3D models using Three.js with UV-mapped canvas textures (1024x1024)
- **Brush System** — 6 brushes: Round, Flat, Filbert, Watercolor, Airbrush, Palette knife with wetness, viscosity, opacity, flow controls
- **Tools** — Brush, Blend/Smudge, Eraser, Eyedropper, Orbit
- **Layers** — Multiple paint layers with visibility, opacity, base material lock
- **Pen Pressure** — Supports stylus pressure (lighter touch = softer stroke)
- **Materials** — Matte, Satin, Glazed finishes with roughness control
- **Import/Export** — Import .glb models (requires UVs), export painted GLB with embedded textures, screenshot as PNG
- **Reference** — Import images to extract palettes or create color studies on model

## Stack

- React 19 + TypeScript
- Vite 7 + vite-plugin-singlefile (single-file build)
- Three.js 0.186 (OrbitControls, GLTFLoader/Exporter, RoomEnvironment)
- Tailwind CSS 4.1
- lucide-react icons

## Development

```bash
npm install
npm run dev    # start dev server
npm run build  # production build (single file dist/index.html)
npm run preview
```

## Project Structure

```
index.html
src/
  App.tsx          # Main UI - brush studio, color, layers, modals
  painting.ts      # PaintingEngine - Three.js scene, raycasting, brush strokes, layers, undo/redo
  main.tsx
  index.css        # Full styling (DM Sans, Manrope)
  utils/cn.ts
vite.config.ts
tsconfig.json
```

## Keyboard Shortcuts

- B: Paint brush, M: Blend, E: Erase, I: Eyedropper
- Space + drag: Orbit model
- [ / ]: Change brush size
- Ctrl/Cmd+Z: Undo, Ctrl/Cmd+Shift+Z: Redo
- Ctrl/Cmd+S: Export

## Build

Build outputs a single self-contained `dist/index.html` (~975KB, ~263KB gzipped) with inlined JS/CSS.

## License

MIT
