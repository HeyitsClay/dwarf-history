# Dwarf History - Project Context

## Current State (Last Updated: 2026-02-09)

### Architecture
- **React + TypeScript + Vite** app for viewing Dwarf Fortress Legends XML files
- **Dexie.js (IndexedDB)** for client-side storage of parsed data
- **Web Worker** for XML parsing (falls back to main thread if needed)
- Supports files up to 500MB+

### Key Features Implemented

#### 1. Guild Hall - Professions & Masters
- **5 Schools**: Martial Academy, Craftsman's Guild, Life Circle, Mind Society, Way of the Body
- **21 Categories**: Combat, Weaponry, Siegecraft, Smithing, Stoneworking, Woodworking, Textile Arts, Crafting, Engineering, Medicine, Agriculture, Foodcraft, Animal Handling, Command, Social Arts, Scholarship, Performance, Athletics, Survival, Industry, Miscellaneous
- **Best Master Calculation**: Sum of all skill IPs in category / 100 (floor)
- **Expandable Cards**: Click to see top 5 skills per category

#### 2. Skill Categorization
- Comprehensive mapping of all Dwarf Fortress skills
- Skills normalized to uppercase to prevent duplicates
- XML artifact sanitization (`<skill>` prefixes stripped)

#### 3. Performance Optimizations
- **512KB chunks** for file reading
- Character-by-character XML parsing (no regex)
- `indexOf()` based tag parsing for large files
- Removed `Math.max(...spread)` that caused stack overflow
- Filter invalid IDs before database storage

### Known Issues / Notes

1. **Swimming skill** - May not appear if no dwarves in world have learned it (data-dependent)
2. **Re-upload required** - Old uploaded files have corrupted skill names with `<skill>` prefixes. Clear data and re-upload to fix.
3. **Miscellaneous category** - Only contains Crutch Walk (no All-Star ranking)

### File Structure
```
src/
  components/
    Overview.tsx      - Main dashboard with Guild Hall
    UploadZone.tsx    - File upload with drag-drop
  workers/
    xmlParser.ts      - Web worker XML parser
  xmlParserMain.ts    - Main thread fallback parser
  db/database.ts      - Dexie/IndexedDB setup
```

### Skill Groupings (for reference)
| School | Categories |
|--------|-----------|
| Martial | Combat, Weaponry, Siegecraft, Command |
| Crafts | Smithing, Stoneworking, Woodworking, Textile Arts, Crafting, Engineering |
| Life | Medicine, Agriculture, Foodcraft, Animal Handling |
| Mind | Social Arts, Scholarship, Performance |
| Physical | Athletics, Survival, Industry |

### Next Session Notes
- User likes the Guild Hall design
- Level formula: `Math.floor(totalIp / 100)`
- All stack overflow issues resolved for large files
- XML sanitization working for skill names
