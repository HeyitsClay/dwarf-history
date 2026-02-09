# Dwarf History Viewer

A web-based viewer for Dwarf Fortress Legends XML files. Explore your world's history, track kill counts, and generate stories for your most legendary figures.

![Dwarf Fortress](https://img.shields.io/badge/Dwarf%20Fortress-Legends%20Viewer-8B4513)

## Features

- 📜 **Parse Legends XML**: Load your Dwarf Fortress world exports directly in the browser
- ⚔️ **Kill Tracking**: View detailed combat records and kill counts for each figure
- 🔍 **Search**: Find figures by name or race with instant search
- 📋 **Story Generator**: Copy formatted stories (Markdown) for Reddit sharing
- 💾 **JSON Export**: Export parsed data for sharing or backup
- 🎯 **Hash Router**: Direct links to figures (e.g., `/#/figure/123`)

## Usage

1. Export Legends from Dwarf Fortress:
   - In Legends mode, press `x` to export
   - Select `Legends XML` option
   - The file will be saved as `region-date-legends.xml`

2. Open [Dwarf History Viewer](https://[your-username].github.io/dwarf-history/)

3. Drag and drop your Legends XML file onto the upload area

4. Wait for parsing to complete (may take a moment for large worlds)

5. Search for figures, click to view details, and copy stories!

## Browser Recommendations

| Browser | Recommendation |
|---------|---------------|
| Chrome/Edge | ✅ Best - Full support for large files |
| Firefox | ✅ Good - Works well with most files |
| Safari | ⚠️ Limited - ~50MB storage limit on iOS |

For large Legends files (100MB+), Chrome or Edge is strongly recommended.

## File Size Limits

- **Desktop (Chrome/Edge)**: Virtually unlimited (tested with 200MB+ files)
- **iOS Safari**: ~50MB hard limit due to browser storage restrictions
- **Other mobile**: Varies by browser

If you hit storage limits, try:
1. Using Chrome or Edge on desktop
2. Exporting JSON from a desktop browser and importing on mobile

## Data Storage

All data is stored locally in your browser using IndexedDB. No data is uploaded to any server. You can:
- Clear data anytime with the "Clear" button
- Export parsed data as JSON with "Export" button
- Import JSON files on another device

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

This project is configured for GitHub Pages deployment via GitHub Actions:

1. Fork this repository
2. Enable GitHub Pages in Settings → Pages
3. Set source to "GitHub Actions"
4. Push to `main` branch to trigger deployment

The site will be available at `https://[your-username].github.io/dwarf-history/`

## Architecture

- **Frontend**: React + TypeScript + Vite
- **Storage**: IndexedDB via Dexie.js
- **Parser**: Web Worker with streaming XML parsing
- **Routing**: Hash-based router for GitHub Pages compatibility
- **Styling**: CSS with Dwarf Fortress terminal aesthetic

## XML Structure Support

This viewer handles the standard Dwarf Fortress Legends XML format:

- `<historical_figures>` - Character data including race, birth/death, skills
- `<historical_events>` - Events including `hf died` with slayer info
- `<sites>` - Location data with coordinates
- `<entities>` - Civilizations and groups

Kill data is extracted from `hf died` events where `slayer_hfid` is present.

## License

MIT License - Feel free to use and modify as you wish.

## Credits

- [Dwarf Fortress](https://www.bay12games.com/dwarves/) by Tarn and Zach Adams
- Built with [Vite](https://vitejs.dev/), [React](https://react.dev/), and [Dexie.js](https://dexie.org/)
