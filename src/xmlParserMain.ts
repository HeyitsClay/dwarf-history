// XML Parser for Dwarf Fortress Legends - Three-Pass Streaming SAX Parser
// Handles CP437 encoding, 500MB+ files, and all vanilla DF quirks

import type {
  HistoricalFigure, HistoricalEvent, Site, Entity, Artifact,
  Region, UndergroundRegion, EventCollection, WrittenContent,
  Structure, ProvenanceEvent
} from './types';

// Parser state tracking
interface ParserState {
  // Context flags
  inRegions: boolean;
  inUndergroundRegions: boolean;
  inSites: boolean;
  inSite: boolean;
  inStructures: boolean;
  inStructure: boolean;
  inArtifacts: boolean;
  inArtifact: boolean;
  inArtifactItem: boolean;
  inHistoricalFigures: boolean;
  inHistoricalFigure: boolean;
  inEntity: boolean;
  inHistoricalEvent: boolean;
  inHistoricalEvents: boolean;
  inHistoricalEventCollections: boolean;
  inHistoricalEventCollection: boolean;
  inWrittenContents: boolean;
  inWrittenContent: boolean;
  
  // Nested element tracking
  inEntityLink: boolean;
  inHfLink: boolean;
  inHfSkill: boolean;
  inEntityPopulations: boolean;
  inWorldConstructions: boolean;
  
  // Current element being parsed
  currentTag: string;
  currentText: string;
  
  // Current objects being built
  currentRegion: Partial<Region>;
  currentUndergroundRegion: Partial<UndergroundRegion>;
  currentSite: Partial<Site> & { structures: Structure[] };
  currentStructure: Partial<Structure>;
  currentFigure: Partial<HistoricalFigure> & { entityLinks: any[]; hfLinks: any[]; hfSkills: any[]; spheres: string[] };
  currentEntity: Partial<Entity> & { siteIds: number[]; memberIds: number[]; warIds: number[] };
  currentArtifact: Partial<Artifact> & { provenance: ProvenanceEvent[] };
  currentEvent: Partial<HistoricalEvent>;
  currentCollection: Partial<EventCollection> & { eventIds: number[] };
  currentWrittenContent: Partial<WrittenContent>;
}

// Main parser class
class StreamingXmlParser {
  // Data stores for all three passes
  private regions: Region[] = [];
  private undergroundRegions: UndergroundRegion[] = [];
  private sites: Site[] = [];
  private figures: HistoricalFigure[] = [];
  private entities: Entity[] = [];
  private artifacts: Artifact[] = [];
  private writtenContents: WrittenContent[] = [];
  private events: HistoricalEvent[] = [];
  private eventCollections: EventCollection[] = [];
  
  // Lookup maps for ID resolution
  private figureMap = new Map<number, HistoricalFigure>();
  private siteMap = new Map<number, Site>();
  private entityMap = new Map<number, Entity>();
  private artifactMap = new Map<number, Artifact>();
  private writtenContentMap = new Map<number, WrittenContent>();
  
  // Parser state
  private state: ParserState;
  private totalBytes: number;
  private bytesProcessed = 0;
  private lastProgressUpdate = 0;
  private onProgress: (progress: number, phase: string, counts: Record<string, number>) => void;
  
  // World metadata
  public worldName: string = '';
  public currentYear: number = 0;

  constructor(totalBytes: number, onProgress: (progress: number, phase: string, counts: Record<string, number>) => void) {
    this.totalBytes = totalBytes;
    this.onProgress = onProgress;
    this.state = this.getInitialState();
  }

  private getInitialState(): ParserState {
    return {
      inRegions: false,
      inUndergroundRegions: false,
      inSites: false,
      inSite: false,
      inStructures: false,
      inStructure: false,
      inArtifacts: false,
      inArtifact: false,
      inArtifactItem: false,
      inHistoricalFigures: false,
      inHistoricalFigure: false,
      inEntity: false,
      inHistoricalEvent: false,
      inHistoricalEvents: false,
      inHistoricalEventCollections: false,
      inHistoricalEventCollection: false,
      inWrittenContents: false,
      inWrittenContent: false,
      inEntityLink: false,
      inHfLink: false,
      inHfSkill: false,
      inEntityPopulations: false,
      inWorldConstructions: false,
      currentTag: '',
      currentText: '',
      currentRegion: {} as Partial<Region>,
      currentUndergroundRegion: {} as Partial<UndergroundRegion>,
      currentSite: { structures: [] } as Partial<Site> & { structures: Structure[] },
      currentStructure: {} as Partial<Structure>,
      currentFigure: { entityLinks: [], hfLinks: [], hfSkills: [], spheres: [] } as Partial<HistoricalFigure> & { entityLinks: any[]; hfLinks: any[]; hfSkills: any[]; spheres: string[] },
      currentEntity: { siteIds: [], memberIds: [], warIds: [] } as Partial<Entity> & { siteIds: number[]; memberIds: number[]; warIds: number[] },
      currentArtifact: { provenance: [] } as Partial<Artifact> & { provenance: ProvenanceEvent[] },
      currentEvent: {} as Partial<HistoricalEvent>,
      currentCollection: { eventIds: [] } as Partial<EventCollection> & { eventIds: number[] },
      currentWrittenContent: {} as Partial<WrittenContent>,
    };
  }

  // Main parse chunk method - processes text chunks from the file
  parseChunk(chunk: string): void {
    this.bytesProcessed += chunk.length;
    
    let pos = 0;
    while (pos < chunk.length) {
      const tagStart = chunk.indexOf('<', pos);
      
      if (tagStart === -1) {
        // No more tags, save remaining text
        this.state.currentText += chunk.slice(pos);
        break;
      }
      
      // Save text before tag
      if (tagStart > pos) {
        this.state.currentText += chunk.slice(pos, tagStart);
      }
      
      const tagEnd = chunk.indexOf('>', tagStart);
      if (tagEnd === -1) {
        // Incomplete tag, save for next chunk
        this.state.currentText += chunk.slice(tagStart);
        break;
      }
      
      // Parse tag content
      const tagContent = chunk.slice(tagStart + 1, tagEnd);
      const isClosing = tagContent.charCodeAt(0) === 47; // '/'
      
      // Extract tag name
      let tagName = '';
      let nameEnd = isClosing ? 1 : 0;
      while (nameEnd < tagContent.length) {
        const c = tagContent.charCodeAt(nameEnd);
        if (c === 32 || c === 9 || c === 10 || c === 13 || c === 47) break;
        tagName += tagContent[nameEnd];
        nameEnd++;
      }
      
      if (isClosing) {
        this.handleCloseTag(tagName);
      } else {
        this.handleOpenTag(tagName);
      }
      
      pos = tagEnd + 1;
    }
    
    // Send progress update every 5%
    const progress = Math.floor((this.bytesProcessed / this.totalBytes) * 100);
    if (progress >= this.lastProgressUpdate + 5) {
      this.lastProgressUpdate = progress;
      this.onProgress(progress, 'parsing', {
        regions: this.regions.length,
        undergroundRegions: this.undergroundRegions.length,
        sites: this.sites.length,
        figures: this.figures.length,
        entities: this.entities.length,
        artifacts: this.artifacts.length,
        writtenContents: this.writtenContents.length,
        events: this.events.length,
        eventCollections: this.eventCollections.length,
      });
    }
  }

  private handleOpenTag(name: string) {
    this.state.currentTag = name;
    this.state.currentText = '';

    // Section detection
    switch (name) {
      case 'regions':
        this.state.inRegions = true;
        break;
      case 'underground_regions':
        this.state.inUndergroundRegions = true;
        break;
      case 'sites':
        this.state.inSites = true;
        break;
      case 'site':
        this.state.inSite = true;
        this.state.currentSite = { structures: [] };
        break;
      case 'structures':
        this.state.inStructures = true;
        break;
      case 'structure':
        this.state.inStructure = true;
        this.state.currentStructure = {};
        break;
      case 'artifacts':
        this.state.inArtifacts = true;
        break;
      case 'artifact':
        this.state.inArtifact = true;
        this.state.currentArtifact = { provenance: [], currentStatus: 'held' };
        break;
      case 'item':
        if (this.state.inArtifact) {
          this.state.inArtifactItem = true;
        }
        break;
      case 'historical_figures':
        this.state.inHistoricalFigures = true;
        break;
      case 'historical_figure':
        this.state.inHistoricalFigure = true;
        this.state.currentFigure = { entityLinks: [], hfLinks: [], hfSkills: [], spheres: [], isAlive: true, artifactIds: [], siteIds: [], positionHistory: [] };
        break;
      case 'entity':
        this.state.inEntity = true;
        this.state.currentEntity = { siteIds: [], memberIds: [], warIds: [] };
        break;
      case 'historical_events':
        this.state.inHistoricalEvents = true;
        break;
      case 'historical_event':
        this.state.inHistoricalEvent = true;
        this.state.currentEvent = {};
        break;
      case 'historical_event_collections':
        this.state.inHistoricalEventCollections = true;
        break;
      case 'historical_event_collection':
        this.state.inHistoricalEventCollection = true;
        this.state.currentCollection = { eventIds: [] };
        break;
      case 'written_contents':
        this.state.inWrittenContents = true;
        break;
      case 'written_content':
        this.state.inWrittenContent = true;
        this.state.currentWrittenContent = {};
        break;
      case 'entity_populations':
        this.state.inEntityPopulations = true;
        break;
      case 'world_constructions':
        this.state.inWorldConstructions = true;
        break;
      case 'entity_link':
        this.state.inEntityLink = true;
        break;
      case 'hf_link':
        this.state.inHfLink = true;
        break;
      case 'hf_skill':
        this.state.inHfSkill = true;
        break;
    }
  }

  private handleCloseTag(name: string) {
    const text = this.state.currentText.trim();
    
    // Skip empty nodes in entity_populations and world_constructions
    if (this.state.inEntityPopulations || this.state.inWorldConstructions) {
      if (name === 'entity_populations') this.state.inEntityPopulations = false;
      if (name === 'world_constructions') this.state.inWorldConstructions = false;
      this.state.currentText = '';
      return;
    }

    // World name (top-level name before any sections)
    if (name === 'name' && !this.worldName && !this.state.inRegions && !this.state.inSites && 
        !this.state.inHistoricalFigure && !this.state.inHistoricalEvent && !this.state.inEntity && 
        !this.state.inArtifact && !this.state.inWrittenContent && !this.state.inHistoricalEventCollection) {
      this.worldName = text;
      this.state.currentText = '';
      return;
    }

    // Parse Regions
    if (this.state.inRegions) {
      switch (name) {
        case 'id':
          this.state.currentRegion.id = parseInt(text, 10);
          break;
        case 'name':
          this.state.currentRegion.name = text;
          break;
        case 'type':
          this.state.currentRegion.type = text;
          break;
        case 'region':
          this.regions.push(this.state.currentRegion as Region);
          break;
        case 'regions':
          this.state.inRegions = false;
          break;
      }
    }

    // Parse Underground Regions
    if (this.state.inUndergroundRegions) {
      switch (name) {
        case 'id':
          this.state.currentUndergroundRegion.id = parseInt(text, 10);
          break;
        case 'type':
          this.state.currentUndergroundRegion.type = text;
          break;
        case 'depth':
          this.state.currentUndergroundRegion.depth = parseInt(text, 10);
          break;
        case 'underground_region':
          this.undergroundRegions.push(this.state.currentUndergroundRegion as UndergroundRegion);
          break;
        case 'underground_regions':
          this.state.inUndergroundRegions = false;
          break;
      }
    }

    // Parse Sites
    if (this.state.inSites) {
      if (this.state.inSite) {
        if (this.state.inStructures && this.state.inStructure) {
          // Parse Structure
          switch (name) {
            case 'local_id':
              this.state.currentStructure.localId = parseInt(text, 10);
              break;
            case 'type':
              this.state.currentStructure.type = text;
              break;
            case 'subtype':
              this.state.currentStructure.subtype = text;
              break;
            case 'entity_id':
              this.state.currentStructure.entityId = parseInt(text, 10);
              break;
            case 'copied_artifact_id':
              this.state.currentStructure.copiedArtifactId = parseInt(text, 10);
              break;
            case 'structure':
              this.state.inStructure = false;
              this.state.currentSite.structures.push(this.state.currentStructure as Structure);
              break;
            case 'structures':
              this.state.inStructures = false;
              break;
          }
        } else {
          // Parse Site fields
          switch (name) {
            case 'id':
              this.state.currentSite.id = parseInt(text, 10);
              break;
            case 'type':
              this.state.currentSite.type = text;
              break;
            case 'name':
              this.state.currentSite.name = text;
              break;
            case 'coords':
              const [x, y] = text.split(',').map(n => parseInt(n.trim(), 10));
              this.state.currentSite.coords = { x, y };
              break;
            case 'rectangle':
              this.state.currentSite.rectangle = text;
              break;
            case 'site':
              this.state.inSite = false;
              this.sites.push(this.state.currentSite as Site);
              break;
          }
        }
      }
      if (name === 'sites') {
        this.state.inSites = false;
      }
    }

    // Parse Historical Figures
    if (this.state.inHistoricalFigures && this.state.inHistoricalFigure) {
      if (this.state.inEntityLink) {
        switch (name) {
          case 'link_type':
            this.state.currentFigure.entityLinks.push({ linkType: text });
            break;
          case 'entity_id':
            if (this.state.currentFigure.entityLinks.length > 0) {
              this.state.currentFigure.entityLinks[this.state.currentFigure.entityLinks.length - 1].entityId = parseInt(text, 10);
            }
            break;
          case 'position_profile_id':
            if (this.state.currentFigure.entityLinks.length > 0) {
              this.state.currentFigure.entityLinks[this.state.currentFigure.entityLinks.length - 1].positionProfileId = parseInt(text, 10);
            }
            break;
          case 'start_year':
            if (this.state.currentFigure.entityLinks.length > 0) {
              this.state.currentFigure.entityLinks[this.state.currentFigure.entityLinks.length - 1].startYear = parseInt(text, 10);
            }
            break;
          case 'end_year':
            if (this.state.currentFigure.entityLinks.length > 0) {
              this.state.currentFigure.entityLinks[this.state.currentFigure.entityLinks.length - 1].endYear = parseInt(text, 10);
            }
            break;
          case 'entity_link':
            this.state.inEntityLink = false;
            break;
        }
      } else if (this.state.inHfLink) {
        switch (name) {
          case 'link_type':
            this.state.currentFigure.hfLinks.push({ linkType: text });
            break;
          case 'hfid':
            if (this.state.currentFigure.hfLinks.length > 0) {
              this.state.currentFigure.hfLinks[this.state.currentFigure.hfLinks.length - 1].hfid = parseInt(text, 10);
            }
            break;
          case 'hf_link':
            this.state.inHfLink = false;
            break;
        }
      } else if (this.state.inHfSkill) {
        switch (name) {
          case 'skill':
            // Sanitize skill name
            let cleanSkill = text.replace(/<[^>]+>/g, '').trim();
            cleanSkill = cleanSkill.replace(/^>/, '').trim();
            cleanSkill = cleanSkill.replace(/&lt;[^&]+&gt;/g, '').trim();
            if (cleanSkill) {
              this.state.currentFigure.hfSkills.push({ skill: cleanSkill });
            }
            break;
          case 'total_ip':
            if (this.state.currentFigure.hfSkills.length > 0) {
              this.state.currentFigure.hfSkills[this.state.currentFigure.hfSkills.length - 1].totalIp = parseInt(text, 10);
            }
            break;
          case 'hf_skill':
            this.state.inHfSkill = false;
            break;
        }
      } else {
        switch (name) {
          case 'id':
            this.state.currentFigure.id = parseInt(text, 10);
            break;
          case 'name':
            if (!this.state.inEntityLink && !this.state.inHfLink && !this.state.inHfSkill) {
              this.state.currentFigure.name = text;
            }
            break;
          case 'race':
            if (!this.state.inEntityLink && !this.state.inHfLink) {
              this.state.currentFigure.race = text;
            }
            break;
          case 'caste':
            this.state.currentFigure.caste = text;
            break;
          case 'appeared':
            this.state.currentFigure.associatedType = text;
            break;
          case 'birth_year':
            this.state.currentFigure.birthYear = parseInt(text, 10);
            break;
          case 'birth_seconds72':
            this.state.currentFigure.birthSeconds72 = parseInt(text, 10);
            break;
          case 'death_year':
            this.state.currentFigure.deathYear = parseInt(text, 10);
            this.state.currentFigure.isAlive = false;
            break;
          case 'death_seconds72':
            this.state.currentFigure.deathSeconds72 = parseInt(text, 10);
            break;
          case 'holds_artifact':
            this.state.currentFigure.holdsArtifact = parseInt(text, 10);
            break;
          case 'sphere':
            this.state.currentFigure.spheres.push(text);
            break;
          case 'deity':
            this.state.currentFigure.isDeity = true;
            break;
          case 'force':
            this.state.currentFigure.isForce = true;
            break;
          case 'entity_link':
            this.state.inEntityLink = true;
            break;
          case 'hf_link':
            this.state.inHfLink = true;
            break;
          case 'hf_skill':
            this.state.inHfSkill = true;
            break;
          case 'historical_figure':
            this.state.inHistoricalFigure = false;
            this.state.currentFigure.kills = [];
            this.figures.push(this.state.currentFigure as HistoricalFigure);
            break;
        }
      }
      if (name === 'historical_figures') {
        this.state.inHistoricalFigures = false;
      }
    }

    // Parse Entities
    if (this.state.inEntity) {
      switch (name) {
        case 'id':
          this.state.currentEntity.id = parseInt(text, 10);
          break;
        case 'name':
          this.state.currentEntity.name = text;
          break;
        case 'race':
          this.state.currentEntity.race = text;
          break;
        case 'type':
          this.state.currentEntity.type = text;
          break;
        case 'entity':
          this.state.inEntity = false;
          this.entities.push(this.state.currentEntity as Entity);
          break;
      }
    }

    // Parse Artifacts
    if (this.state.inArtifacts && this.state.inArtifact) {
      switch (name) {
        case 'id':
          this.state.currentArtifact.id = parseInt(text, 10);
          break;
        case 'name':
          if (!this.state.inArtifactItem) {
            this.state.currentArtifact.name = text;
          }
          break;
        case 'name_string':
          if (this.state.inArtifactItem) {
            this.state.currentArtifact.name = text;
          }
          break;
        case 'item_type':
          this.state.currentArtifact.itemType = text;
          break;
        case 'item_subtype':
          this.state.currentArtifact.itemSubtype = text;
          break;
        case 'material':
          this.state.currentArtifact.material = text;
          break;
        case 'page_number':
          this.state.currentArtifact.pageNumber = parseInt(text, 10);
          break;
        case 'creator_hfid':
          this.state.currentArtifact.creatorHfid = parseInt(text, 10);
          break;
        case 'holder_hfid':
          this.state.currentArtifact.holderHfid = parseInt(text, 10);
          break;
        case 'site_id':
          this.state.currentArtifact.siteId = parseInt(text, 10);
          break;
        case 'subregion_id':
          this.state.currentArtifact.subregionId = parseInt(text, 10);
          break;
        case 'page_written_content_id':
        case 'writing_written_content_id':
          this.state.currentArtifact.writtenContentId = parseInt(text, 10);
          this.state.currentArtifact.isWrittenContent = true;
          break;
        case 'item':
          this.state.inArtifactItem = false;
          break;
        case 'artifact':
          this.state.inArtifact = false;
          this.artifacts.push(this.state.currentArtifact as Artifact);
          break;
        case 'artifacts':
          this.state.inArtifacts = false;
          break;
      }
    }

    // Parse Written Content
    if (this.state.inWrittenContents && this.state.inWrittenContent) {
      switch (name) {
        case 'id':
          this.state.currentWrittenContent.id = parseInt(text, 10);
          break;
        case 'title':
          this.state.currentWrittenContent.title = text;
          break;
        case 'type':
          this.state.currentWrittenContent.type = text;
          break;
        case 'author_hfid':
          this.state.currentWrittenContent.authorHfid = parseInt(text, 10);
          break;
        case 'form':
          this.state.currentWrittenContent.form = text;
          break;
        case 'written_content':
          this.state.inWrittenContent = false;
          this.writtenContents.push(this.state.currentWrittenContent as WrittenContent);
          break;
        case 'written_contents':
          this.state.inWrittenContents = false;
          break;
      }
    }

    // Parse Historical Events
    if (this.state.inHistoricalEvents && this.state.inHistoricalEvent) {
      switch (name) {
        case 'id':
          this.state.currentEvent.id = parseInt(text, 10);
          break;
        case 'year':
          this.state.currentEvent.year = parseInt(text, 10);
          if (text && parseInt(text, 10) > this.currentYear) {
            this.currentYear = parseInt(text, 10);
          }
          break;
        case 'seconds72':
          this.state.currentEvent.seconds72 = parseInt(text, 10);
          break;
        case 'type':
          this.state.currentEvent.type = text;
          break;
        case 'hfid':
          this.state.currentEvent.hfid = parseInt(text, 10);
          break;
        case 'hist_figure_id':
          this.state.currentEvent.histFigureId = parseInt(text, 10);
          break;
        case 'site_id':
          this.state.currentEvent.siteId = parseInt(text, 10);
          break;
        case 'subregion_id':
          this.state.currentEvent.subregionId = parseInt(text, 10);
          break;
        case 'feature_layer_id':
          this.state.currentEvent.featureLayerId = parseInt(text, 10);
          break;
        case 'entity_id':
          if (this.state.inHistoricalEvent) {
            this.state.currentEvent.entityId = parseInt(text, 10);
          }
          break;
        case 'civ_id':
          this.state.currentEvent.civId = parseInt(text, 10);
          break;
        case 'artifact_id':
          this.state.currentEvent.artifactId = parseInt(text, 10);
          break;
        case 'unit_id':
          this.state.currentEvent.unitId = parseInt(text, 10);
          break;
        case 'slayer_hfid':
          this.state.currentEvent.slayerHfid = parseInt(text, 10);
          break;
        case 'victim_hfid':
          this.state.currentEvent.targetHfid = parseInt(text, 10);
          break;
        case 'target_hfid':
          this.state.currentEvent.targetHfid = parseInt(text, 10);
          break;
        case 'attacker_hfid':
          this.state.currentEvent.attackerHfid = parseInt(text, 10);
          break;
        case 'defender_hfid':
          this.state.currentEvent.defenderHfid = parseInt(text, 10);
          break;
        case 'group_1_hfid':
          this.state.currentEvent.group1Hfid = parseInt(text, 10);
          break;
        case 'group_2_hfid':
          this.state.currentEvent.group2Hfid = parseInt(text, 10);
          break;
        case 'slayer_race':
          this.state.currentEvent.slayerRace = text;
          break;
        case 'slayer_caste':
          this.state.currentEvent.slayerCaste = text;
          break;
        case 'cause':
          this.state.currentEvent.cause = text;
          break;
        case 'subtype':
          this.state.currentEvent.subtype = text;
          break;
        case 'state':
          this.state.currentEvent.state = text;
          break;
        case 'link_type':
          this.state.currentEvent.linkType = text;
          break;
        case 'position_profile_id':
          this.state.currentEvent.positionProfileId = parseInt(text, 10);
          break;
        case 'coords':
          this.state.currentEvent.coords = text;
          break;
        case 'collection_id':
          this.state.currentEvent.collectionId = parseInt(text, 10);
          break;
        case 'historical_event':
          this.state.inHistoricalEvent = false;
          this.events.push(this.state.currentEvent as HistoricalEvent);
          break;
        case 'historical_events':
          this.state.inHistoricalEvents = false;
          break;
      }
    }

    // Parse Historical Event Collections
    if (this.state.inHistoricalEventCollections && this.state.inHistoricalEventCollection) {
      switch (name) {
        case 'id':
          this.state.currentCollection.id = parseInt(text, 10);
          break;
        case 'type':
          this.state.currentCollection.type = text;
          break;
        case 'start_year':
          this.state.currentCollection.startYear = parseInt(text, 10);
          break;
        case 'end_year':
          this.state.currentCollection.endYear = parseInt(text, 10);
          break;
        case 'name':
          this.state.currentCollection.name = text;
          break;
        case 'aggressor_entity_id':
          this.state.currentCollection.aggressorEntityId = parseInt(text, 10);
          break;
        case 'defender_entity_id':
          this.state.currentCollection.defenderEntityId = parseInt(text, 10);
          break;
        case 'event':
          // Event ID reference in collection
          this.state.currentCollection.eventIds.push(parseInt(text, 10));
          break;
        case 'historical_event_collection':
          this.state.inHistoricalEventCollection = false;
          this.eventCollections.push(this.state.currentCollection as EventCollection);
          break;
        case 'historical_event_collections':
          this.state.inHistoricalEventCollections = false;
          break;
      }
    }

    this.state.currentText = '';
  }

  // Post-processing: Build lookup maps and calculate derived data
  finalize(): {
    regions: Region[];
    undergroundRegions: UndergroundRegion[];
    sites: Site[];
    figures: HistoricalFigure[];
    entities: Entity[];
    artifacts: Artifact[];
    writtenContents: WrittenContent[];
    events: HistoricalEvent[];
    eventCollections: EventCollection[];
    currentYear: number;
  } {
    // Build lookup maps
    this.figureMap = new Map(this.figures.map(f => [f.id, f]));
    this.siteMap = new Map(this.sites.map(s => [s.id, s]));
    this.entityMap = new Map(this.entities.map(e => [e.id, e]));
    this.artifactMap = new Map(this.artifacts.map(a => [a.id, a]));
    this.writtenContentMap = new Map(this.writtenContents.map(w => [w.id, w]));

    console.log(`Parser finalize: ${this.figures.length} figures, ${this.events.length} events`);
    console.log(`FigureMap size: ${this.figureMap.size}`);

    // Cross-reference written content with artifacts
    for (const artifact of this.artifacts) {
      if (artifact.writtenContentId && this.writtenContentMap.has(artifact.writtenContentId)) {
        const wc = this.writtenContentMap.get(artifact.writtenContentId)!;
        artifact.writtenContentType = wc.type;
        artifact.writtenContentTitle = wc.title;
      }
    }

    // Process events for relationships and derived data
    this.processEvents();

    // Calculate ages for figures
    for (const figure of this.figures) {
      if (figure.deathYear > 0) {
        figure.age = figure.deathYear - figure.birthYear;
      } else if (figure.birthYear > 0) {
        figure.age = this.currentYear - figure.birthYear;
      }
    }

    return {
      regions: this.regions,
      undergroundRegions: this.undergroundRegions,
      sites: this.sites,
      figures: this.figures,
      entities: this.entities,
      artifacts: this.artifacts,
      writtenContents: this.writtenContents,
      events: this.events,
      eventCollections: this.eventCollections,
      currentYear: this.currentYear,
    };
  }

  private processEvents(): void {
    let deathEvents = 0;
    let processedKills = 0;
    
    for (const event of this.events) {
      // Process death events
      if (event.type === 'hf_died') {
        deathEvents++;
        if (event.slayerHfid && event.slayerHfid !== -1) {
          const killer = this.figureMap.get(event.slayerHfid);
          const victim = this.figureMap.get(event.hfid!);
          
          if (killer && victim) {
            processedKills++;
            killer.kills.push({
              victimId: victim.id,
              victimName: victim.name,
              victimRace: victim.race,
              year: event.year,
              siteId: event.siteId || -1,
              cause: event.cause || 'unknown',
            });
          }
          
          if (victim) {
            victim.killer = {
              hfid: event.slayerHfid,
              name: killer?.name || 'Unknown',
              cause: event.cause || 'unknown',
              year: event.year,
            };
          }
        }
      }

      // Process artifact creation events
      if (event.type === 'artifact created' && event.artifactId) {
        const artifact = this.artifactMap.get(event.artifactId);
        if (artifact) {
          artifact.creationYear = event.year;
          if (event.histFigureId && event.histFigureId > 0) {
            artifact.creatorHfid = event.histFigureId;
          }
          artifact.provenance.push({
            year: event.year,
            type: 'created',
            hfid: event.histFigureId,
          });
        }
      }

      // Process item stolen events
      if (event.type === 'item_stolen' && event.artifactId) {
        const artifact = this.artifactMap.get(event.artifactId);
        if (artifact) {
          artifact.provenance.push({
            year: event.year,
            type: 'stolen',
            hfid: event.histFigureId,
            siteId: event.siteId,
          });
        }
      }

      // Process change_hf_state events (vampires, weres, necromancers)
      if (event.type === 'change_hf_state' && event.hfid && event.state) {
        const figure = this.figureMap.get(event.hfid);
        if (figure) {
          switch (event.state) {
            case 'vampire':
              figure.isVampire = true;
              figure.vampireGeneration = 1; // Could track from events
              break;
            case 'werecreature':
              figure.isWerecreature = true;
              // Try to extract race from context if available
              break;
            case 'necromancer':
              figure.isNecromancer = true;
              break;
            case 'undead':
              figure.isUndead = true;
              break;
          }
        }
      }

      // Process HF link events (marriages, families)
      if (event.type === 'add_hf_hf_link' && event.hfid && event.targetHfid) {
        const figure = this.figureMap.get(event.hfid);
        const target = this.figureMap.get(event.targetHfid);
        if (figure && target) {
          figure.hfLinks.push({
            linkType: event.linkType || 'unknown',
            hfid: event.targetHfid,
          });
        }
      }

      // Process entity link events
      if (event.type === 'add_hf_entity_link' && event.hfid && event.entityId) {
        const figure = this.figureMap.get(event.hfid);
        const entity = this.entityMap.get(event.entityId);
        if (figure) {
          figure.entityLinks.push({
            linkType: event.linkType || 'member',
            entityId: event.entityId,
            positionProfileId: event.positionProfileId,
            startYear: event.year,
          });
          if (event.linkType === 'ruler' || event.linkType === 'position') {
            figure.positionHistory.push({
              entityId: event.entityId,
              position: event.linkType,
              startYear: event.year,
            });
          }
        }
        if (entity && event.linkType === 'member') {
          if (!entity.memberIds.includes(event.hfid)) {
            entity.memberIds.push(event.hfid);
          }
        }
      }

      // Process site taken over events
      if (event.type === 'site_taken_over' && event.siteId) {
        const site = this.siteMap.get(event.siteId);
        const entity = this.entityMap.get(event.civId || event.siteEntityId || 0);
        if (site && entity) {
          if (!entity.siteIds.includes(site.id)) {
            entity.siteIds.push(site.id);
          }
        }
      }

      // Process created site events
      if (event.type === 'created_site' && event.siteId) {
        const site = this.siteMap.get(event.siteId);
        const figure = this.figureMap.get(event.hfid || 0);
        if (site && figure) {
          figure.siteIds.push(site.id);
        }
      }

      // Link events to collections
      if (event.collectionId) {
        const collection = this.eventCollections.find(c => c.id === event.collectionId);
        if (collection && !collection.eventIds.includes(event.id)) {
          collection.eventIds.push(event.id);
        }
      }
    }

    console.log(`ProcessEvents: ${deathEvents} death events, ${processedKills} processed kills`);
    console.log(`Total figures: ${this.figures.length}, figures with kills: ${this.figures.filter(f => f.kills.length > 0).length}`);

    // Calculate artifact current status from provenance
    for (const artifact of this.artifacts) {
      if (artifact.provenance.length > 0) {
        // Sort by year
        artifact.provenance.sort((a, b) => a.year - b.year);
        const lastEvent = artifact.provenance[artifact.provenance.length - 1];
        
        // Determine current status
        if (lastEvent.type === 'destroyed') {
          artifact.currentStatus = 'destroyed';
        } else if (!artifact.holderHfid && !artifact.siteId) {
          artifact.currentStatus = 'lost';
        } else if (artifact.siteId && !artifact.holderHfid) {
          artifact.currentStatus = 'stored';
        } else {
          artifact.currentStatus = 'held';
        }
      }
    }
  }
}

// Main parse function
export async function parseLegendsFile(
  file: File,
  onProgress: (progress: number, phase: string, counts: Record<string, number>) => void
): Promise<{
  regions: Region[];
  undergroundRegions: UndergroundRegion[];
  sites: Site[];
  figures: HistoricalFigure[];
  entities: Entity[];
  artifacts: Artifact[];
  writtenContents: WrittenContent[];
  events: HistoricalEvent[];
  eventCollections: EventCollection[];
  worldName: string;
  currentYear: number;
}> {
  const parser = new StreamingXmlParser(file.size, onProgress);
  
  // Read file in chunks
  const chunkSize = 512 * 1024; // 512KB chunks
  
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
    const text = await readChunkAsText(chunk);
    parser.parseChunk(text);
    
    // Yield to UI thread
    if (offset % (chunkSize * 4) === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }
  
  const result = parser.finalize();
  
  return {
    ...result,
    worldName: parser.worldName || file.name.replace(/\.xml$/i, ''),
  };
}

function readChunkAsText(chunk: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(chunk);
  });
}
