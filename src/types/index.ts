// Dwarf Fortress Legends XML Types - Complete Schema

// World Geography
export interface Region {
  id: number;
  name: string;
  type: string; // hills, forest, grassland, desert, lake, mountains, wetland, glacier, tundra, ocean
}

export interface UndergroundRegion {
  id: number;
  type: string; // cavern, underworld, magma
  depth: number;
}

export interface Site {
  id: number;
  type: string;
  name: string;
  coords: { x: number; y: number };
  rectangle?: string; // Some sites use rectangle, camps use single point
  structures: Structure[];
}

export interface Structure {
  localId: number;
  type: string; // underworld_spire, counting_house, mead_hall, dungeon, tomb, market, keep, inn_tavern, temple, library, guildhall, tower
  subtype?: string; // catacombs (for dungeon)
  entityId?: number; // for temples
  copiedArtifactId?: number; // for libraries
}

// Historical Figures
export interface HistoricalFigure {
  id: number;
  name: string;
  race: string;
  caste: string;
  birthYear: number;
  birthSeconds72: number;
  deathYear: number;
  deathSeconds72: number;
  associatedType: string;
  appeared?: number;
  entityLinks: EntityLink[];
  hfLinks: HfLink[];
  hfSkills: HfSkill[];
  spheres: string[];
  holdsArtifact?: number;
  
  // State flags for supernatural beings
  isDeity?: boolean;
  isForce?: boolean;
  isVampire?: boolean;
  isWerecreature?: boolean;
  isNecromancer?: boolean;
  isUndead?: boolean;
  isDemon?: boolean;
  vampireGeneration?: number; // If applicable
  werecreatureRace?: string; // Beast form race
  secretsLearned?: string[]; // For necromancers
  
  // Calculated fields
  age?: number;
  isAlive: boolean;
  kills: KillEvent[];
  killer?: {
    hfid: number;
    name: string;
    cause: string;
    year: number;
  };
  // Expanded calculated data
  artifactIds: number[]; // Artifacts they created or hold
  siteIds: number[]; // Sites they founded or ruled
  positionHistory: PositionRecord[];
}

export interface EntityLink {
  linkType: string;
  entityId: number;
  positionProfileId?: number; // For positions
  startYear?: number;
  endYear?: number;
}

export interface HfLink {
  linkType: string;
  hfid: number;
}

export interface HfSkill {
  skill: string;
  totalIp: number;
}

export interface PositionRecord {
  entityId: number;
  position: string;
  startYear: number;
  endYear?: number;
}

export interface KillEvent {
  victimId: number;
  victimName: string;
  victimRace: string;
  year: number;
  siteId: number;
  cause: string;
}

// Entities (Civilizations, Groups)
export interface Entity {
  id: number;
  name?: string;
  race?: string;
  type?: string; // civilization, religion, sitegovernment, etc.
  parentCiv?: number;
  // Calculated
  siteIds: number[];
  memberIds: number[];
  warIds: number[];
}

// Artifacts
export interface Artifact {
  id: number;
  name?: string;
  itemType?: string;
  itemSubtype?: string;
  material?: string;
  creatorHfid?: number;
  creationYear?: number;
  holderHfid?: number;
  siteId?: number;
  subregionId?: number;
  entityId?: number; // Holy relics held by temples
  
  // Written content
  writtenContentId?: number;
  writtenContentType?: string;
  writtenContentTitle?: string;
  pageNumber?: number;
  isWrittenContent?: boolean;
  
  // Provenance tracking
  provenance: ProvenanceEvent[];
  currentStatus: 'held' | 'stored' | 'lost' | 'destroyed';
}

export interface ProvenanceEvent {
  year: number;
  type: string; // created, stolen, inherited, stored
  hfid?: number;
  siteId?: number;
  entityId?: number;
}

// Historical Events
export interface HistoricalEvent {
  id: number;
  year: number;
  seconds72: number;
  type: string;
  
  // Common IDs
  hfid?: number;
  histFigureId?: number; // alias for hfid used in some events
  siteId?: number;
  subregionId?: number;
  featureLayerId?: number;
  entityId?: number;
  artifactId?: number;
  
  // Death events (hf_died)
  slayerHfid?: number;
  slayerRace?: string;
  slayerCaste?: string;
  cause?: string; // old age, murdered, beheaded, etc.
  
  // Battle events (field_battle, site_taken_over)
  subtype?: string;
  group1Hfid?: number;
  group2Hfid?: number;
  attackerHfid?: number;
  defenderHfid?: number;
  attackerEntityId?: number;
  defenderEntityId?: number;
  
  // HF Link events (add_hf_hf_link)
  targetHfid?: number;
  linkType?: string; // spouse, child, apprentice, etc.
  
  // Entity link events (add_hf_entity_link, remove_hf_entity_link)
  civId?: number;
  positionProfileId?: number;
  
  // State change (change_hf_state) - CRITICAL for vampires/weres/necros
  state?: string; // vampire, werecreature, necromancer, etc.
  
  // Item events (item_stolen)
  unitId?: number;
  
  // Site events
  siteCivId?: number;
  siteEntityId?: number;
  conquerorHfid?: number;
  
  // Agreement events
  agreementId?: number;
  
  // Beast attack events
  beastHfid?: number;
  
  // Collection linking
  collectionId?: number;
  
  // Coords
  coords?: string;
}

// Event Collections (Wars, Beast Attacks, etc.)
export interface EventCollection {
  id: number;
  type: string; // war, beast_attack, duel, site_conquered, theft, insurrection
  startYear: number;
  endYear?: number;
  name?: string;
  
  // War specific
  aggressorEntityId?: number;
  defenderEntityId?: number;
  
  // Beast attack specific
  beastHfid?: number;
  
  // Duel/Theft specific
  challengerHfid?: number;
  targetHfid?: number;
  
  // Site conquered
  siteId?: number;
  attackerCivId?: number;
  defenderCivId?: number;
  
  // Event IDs in this collection
  eventIds: number[];
}

// Written Content (books, slabs, etc.)
export interface WrittenContent {
  id: number;
  title: string;
  type: string;
  authorHfid: number;
  form?: string; // autobiography, poem, choreograph, etc.
}

// World Metadata
export interface WorldMetadata {
  name: string;
  version: string;
  timestamp?: string;
  year: number; // for backwards compatibility
  currentYear: number;
  
  // Counts
  regionCount: number;
  undergroundRegionCount: number;
  siteCount: number;
  figureCount: number;
  entityCount: number;
  artifactCount: number;
  eventCount: number;
  eventCollectionCount: number;
  writtenContentCount: number;
}

// Parsed World Data
export interface ParsedWorld {
  metadata: WorldMetadata;
  regions: Region[];
  undergroundRegions: UndergroundRegion[];
  sites: Site[];
  figures: HistoricalFigure[];
  entities: Entity[];
  artifacts: Artifact[];
  events: HistoricalEvent[];
  eventCollections: EventCollection[];
  writtenContents: WrittenContent[];
}

// View States
export type ViewState = 
  | { type: 'upload' }
  | { type: 'parsing'; progress: number; phase: string }
  | { type: 'overview' }
  | { type: 'list' }
  | { type: 'figure'; id: number }
  | { type: 'site'; id: number }
  | { type: 'entity'; id: number }
  | { type: 'artifact'; id: number }
  | { type: 'war'; id: number };
