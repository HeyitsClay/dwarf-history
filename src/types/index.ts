// Dwarf Fortress Legends XML Types

export interface HistoricalFigure {
  id: number;
  name: string;
  race: string;
  caste: string;
  appeared: number;
  birthYear: number;
  birthSeconds72: number;
  deathYear: number;
  deathSeconds72: number;
  associatedType: string;
  entityLinks: EntityLink[];
  hfLinks: HfLink[];
  hfSkills: HfSkill[];
  spheres: string[];
  holdsArtifact?: number;
  // Computed fields
  kills: KillEvent[];
  killer?: {
    hfid: number;
    name: string;
    cause: string;
    year: number;
  };
  age?: number;
}

export interface EntityLink {
  linkType: string;
  entityId: number;
}

export interface HfLink {
  linkType: string;
  hfid: number;
}

export interface HfSkill {
  skill: string;
  totalIp: number;
}

export interface KillEvent {
  victimId: number;
  victimName: string;
  victimRace: string;
  year: number;
  siteId: number;
  cause: string;
}

export interface Site {
  id: number;
  type: string;
  name: string;
  coords: { x: number; y: number };
  rectangle: string;
}

export interface Entity {
  id: number;
  name?: string;
  race?: string;
  type?: string;
  parentCiv?: number;
}

export interface Artifact {
  id: number;
  name?: string;
  itemType?: string;
  itemSubtype?: string;
  material?: string;
  creatorHfid?: number;
  holderHfid?: number;
  siteId?: number;
  subregionId?: number;
  entityId?: number;
  // For categorization
  isRelic?: boolean;
  isNamedAfterSlaying?: boolean;
  slainBeastName?: string;
  isWrittenContent?: boolean;
  writtenContentId?: number;
  writtenContentType?: string;
  writtenContentTitle?: string;
}

export interface HistoricalEvent {
  id: number;
  year: number;
  seconds72: number;
  type: string;
  // Common fields
  hfid?: number;
  siteId?: number;
  subregionId?: number;
  featureLayerId?: number;
  coords?: string;
  // Death event fields
  slayerHfid?: number;
  slayerRace?: string;
  slayerCaste?: string;
  cause?: string;
  // Battle event fields
  subtype?: string;
  group1Hfid?: number;
  group2Hfid?: number;
  // Entity link fields
  civId?: number;
  link?: string;
  // State change fields
  state?: string;
  // Artifact event fields
  artifactId?: number;
  histFigureId?: number;  // creator/possessor for artifact events
  entityId?: number;      // entity for artifact stored/claimed events
  unitId?: number;
}

export interface WorldMetadata {
  name: string;
  version: string;
  timestamp?: string;
  figureCount: number;
  eventCount: number;
  siteCount: number;
  entityCount: number;
  artifactCount: number;
  year: number;
}

export interface ParsedWorld {
  metadata: WorldMetadata;
  figures: HistoricalFigure[];
  events: HistoricalEvent[];
  sites: Site[];
  entities: Entity[];
  artifacts: Artifact[];
}

export type ViewState = 
  | { type: 'upload' }
  | { type: 'parsing'; progress: number; phase: string }
  | { type: 'overview' }
  | { type: 'list' }
  | { type: 'figure'; id: number }
  | { type: 'site'; id: number }
  | { type: 'entity'; id: number };
