# Dwarf Fortress Legends XML Structure Analysis

## File Analyzed
- **File**: `Legends File Example/Legends File Example.xml`
- **Size**: ~65MB
- **Encoding**: CP437

## Root Node
```xml
<?xml version="1.0" encoding='CP437'?>
<df_world>
```

**No version attribute detected** - The root node is simply `<df_world>` without version info. This is consistent with the Classic (0.47-) format. Premium (50+) may have different structure.

## Key Sections

### 1. Historical Figures (`<historical_figures>`)
Located at line ~20,413

**Structure:**
```xml
<historical_figure>
  <id>0</id>
  <name>otthat strikedanger</name>
  <race>COLOSSUS_BRONZE</race>
  <caste>DEFAULT</caste>
  <appeared>1</appeared>
  <birth_year>-260</birth_year>
  <birth_seconds72>-1</birth_seconds72>
  <death_year>15</death_year>
  <death_seconds72>-1</death_seconds72>
  <associated_type>STANDARD</associated_type>
  
  <!-- Entity links (relationships to civilizations/groups) -->
  <entity_link>
    <link_type>enemy</link_type>
    <entity_id>291</entity_id>
  </entity_link>
  
  <!-- HF links (relationships to other figures) -->
  <hf_link>
    <link_type>child</link_type>
    <hfid>3104</hfid>
  </hf_link>
  
  <!-- Skills -->
  <hf_skill>
    <skill>SITUATIONAL_AWARENESS</skill>
    <total_ip>4500</total_ip>
  </hf_skill>
  
  <!-- Spheres (for deities) -->
  <sphere>metals</sphere>
  <sphere>strength</sphere>
  <sphere>war</sphere>
</historical_figure>
```

**Key Observations:**
- Kill data is NOT stored inline in historical_figure
- Kills are referenced through historical_events with type="hf died"
- Entity links show relationships (enemy, member, etc.)
- HF links show family relationships (child, spouse, etc.)
- Skills stored separately in hf_skill nodes

### 2. Historical Events (`<historical_events>`)
Located at line ~1,351,795

**Structure for Death Events:**
```xml
<historical_event>
  <id>808</id>
  <year>1</year>
  <seconds72>126000</seconds72>
  <type>hf died</type>
  <hfid>537</hfid>                    <!-- Victim -->
  <slayer_hfid>15</slayer_hfid>       <!-- Killer -->
  <slayer_race>COLOSSUS_BRONZE</slayer_race>
  <slayer_caste>DEFAULT</slayer_caste>
  <slayer_item_id>-1</slayer_item_id>
  <slayer_shooter_item_id>-1</slayer_shooter_item_id>
  <site_id>100</site_id>              <!-- Location -->
  <subregion_id>-1</subregion_id>
  <feature_layer_id>-1</feature_layer_id>
  <cause>struck</cause>               <!-- Death cause -->
</historical_event>
```

**Other Event Types:**
- `change hf state` - Figure movement/settlement
- `add hf entity link` - Civilization membership changes
- `hf simple battle event` - Combat without death
- `create entity` - New civilizations formed
- `first contact` - Civilizations meet

### 3. Sites (`<sites>`)
Located at line ~5,748

**Structure:**
```xml
<site>
  <id>1</id>
  <type>cave</type>
  <name>craftedmine the shaft of swallows</name>
  <coords>12,71</coords>                    <!-- x,y coordinates -->
  <rectangle>202,1139:204,1141</rectangle>  <!-- Map rectangle -->
</site>
```

**Coordinate Analysis:**
- Coordinates are valid 2D (x,y) values
- No z-coordinate (elevation) in this data
- Some coords may be -1,-1 for unknown locations
- Rectangle gives detailed world map position

### 4. Entities (`<entities>`)
Located at line ~1,343,170

**Structure:**
```xml
<entity>
  <id>0</id>
  <name>the creation of omen</name>
  <!-- May have race for civilizations -->
</entity>
```

**Entity Types:**
- Civilizations (have race attribute)
- Groups/organizations (gods, mercenary companies)
- Sites can link to entities via civ_id

### 5. Regions (`<regions>`)
Located early in file (lines ~2-200)

**Structure:**
```xml
<region>
  <id>0</id>
  <name>the seas of carrying</name>
  <type>Ocean</type>
</region>
```

## Kill Data Indexing Strategy

Since kills are event-based, not inline:

1. **First Pass**: Parse all historical_figures into a Map by ID
2. **Second Pass**: Parse historical_events
   - When `type === "hf died"` and `slayer_hfid` exists:
     - Look up killer figure by `slayer_hfid`
     - Look up victim figure by `hfid`
     - Add kill to killer's `kills[]` array
     - Add killer info to victim's `killer` field
3. **Result**: Each figure has inline `kills: KillEvent[]` for fast lookup

## Entity Nesting

- Entities can have parent-child relationships via events
- `create entity` events may reference parent civ
- Historical figures link to entities via `entity_link` nodes
- Sites link to entities via `civ_id` in events

## Coordinate Validity

- Sites have valid (x,y) coordinates
- Events reference sites via `site_id`
- Some events have direct `coords` field
- No default (0,0,0) detected; -1 used for "unknown"

## Memory Estimates

Based on file size ~65MB:
- ~13,000+ historical figures
- ~200,000+ historical events
- ~1,000+ sites
- ~1,000+ entities

Parsed JavaScript objects will require roughly 3-5x XML size in memory.
