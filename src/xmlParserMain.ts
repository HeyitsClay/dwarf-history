// XML Parser for main thread (fallback when worker fails)
import type { HistoricalFigure, HistoricalEvent, Site, Entity } from './types';

interface ParserState {
  inHistoricalFigure: boolean;
  inHistoricalEvent: boolean;
  inSite: boolean;
  inEntity: boolean;
  inEntityLink: boolean;
  inHfLink: boolean;
  inHfSkill: boolean;
  currentTag: string;
  currentText: string;
  
  currentFigure: Partial<HistoricalFigure> & { 
    entityLinks: any[]; 
    hfLinks: any[]; 
    hfSkills: any[]; 
    spheres: string[];
  };
  currentEvent: Partial<HistoricalEvent>;
  currentSite: Partial<Site>;
  currentEntity: Partial<Entity>;
}

export async function parseLegendsFile(
  file: File,
  onProgress: (progress: number, counts: { figures: number; events: number; sites: number; entities: number }) => void
): Promise<{ figures: HistoricalFigure[]; events: HistoricalEvent[]; sites: Site[]; entities: Entity[] }> {
  
  console.log('Main parser: Starting with file', file.name, file.size);
  
  const parser = new SimpleXmlParser(file.size, onProgress);
  
  // Read file in chunks using FileReader (main thread version)
  const chunkSize = 2 * 1024 * 1024; // 2MB chunks
  
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
    const text = await readChunkAsText(chunk);
    parser.parseChunk(text);
    
    // Yield to UI thread every chunk
    if (offset % (chunkSize * 5) === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }
  
  console.log('Main parser: File read complete');
  const result = parser.finalize();
  
  // Process kill relationships
  console.log('Main parser: Processing kills...');
  const figureMap = new Map(result.figures.map(f => [f.id, f]));
  
  for (const event of result.events) {
    if (event.type === 'hf died' && event.slayerHfid && event.slayerHfid !== -1) {
      const killer = figureMap.get(event.slayerHfid);
      const victim = figureMap.get(event.hfid!);
      
      if (killer && victim) {
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
  
  // Calculate ages
  const maxYear = Math.max(...result.events.map(e => e.year).filter(y => y > 0), 0);
  for (const figure of result.figures) {
    if (figure.deathYear > 0) {
      figure.age = figure.deathYear - figure.birthYear;
    } else if (figure.birthYear > 0) {
      figure.age = maxYear - figure.birthYear;
    }
  }
  
  console.log('Main parser: Complete!');
  return result;
}

function readChunkAsText(chunk: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(chunk);
  });
}

class SimpleXmlParser {
  private figures: HistoricalFigure[] = [];
  private events: HistoricalEvent[] = [];
  private sites: Site[] = [];
  private entities: Entity[] = [];
  
  private state: ParserState;
  private totalBytes: number;
  private bytesProcessed = 0;
  private lastProgressUpdate = 0;
  private onProgress: (progress: number, counts: { figures: number; events: number; sites: number; entities: number }) => void;

  constructor(totalBytes: number, onProgress: (progress: number, counts: { figures: number; events: number; sites: number; entities: number }) => void) {
    this.totalBytes = totalBytes;
    this.onProgress = onProgress;
    this.state = this.getInitialState();
  }

  private getInitialState(): ParserState {
    return {
      inHistoricalFigure: false,
      inHistoricalEvent: false,
      inSite: false,
      inEntity: false,
      inEntityLink: false,
      inHfLink: false,
      inHfSkill: false,
      currentTag: '',
      currentText: '',
      currentFigure: { entityLinks: [], hfLinks: [], hfSkills: [], spheres: [] },
      currentEvent: {},
      currentSite: {},
      currentEntity: {},
    };
  }

  parseChunk(chunk: string): void {
    this.bytesProcessed += chunk.length;
    
    // Simple tag parsing
    const tagRegex = /<(\/?)(\w+)[^>]*>/g;
    let match;
    let lastIndex = 0;
    
    while ((match = tagRegex.exec(chunk)) !== null) {
      // Process text before this tag
      const text = chunk.slice(lastIndex, match.index);
      if (text) {
        this.state.currentText += text;
      }
      
      const isClosing = match[1] === '/';
      const tagName = match[2];
      
      if (isClosing) {
        this.handleCloseTag(tagName);
      } else {
        this.handleOpenTag(tagName);
      }
      
      lastIndex = tagRegex.lastIndex;
    }
    
    // Process remaining text
    const remainingText = chunk.slice(lastIndex);
    if (remainingText) {
      this.state.currentText += remainingText;
    }
    
    // Send progress update every 5%
    const progress = Math.floor((this.bytesProcessed / this.totalBytes) * 100);
    if (progress >= this.lastProgressUpdate + 5) {
      this.lastProgressUpdate = progress;
      this.onProgress(progress, {
        figures: this.figures.length,
        events: this.events.length,
        sites: this.sites.length,
        entities: this.entities.length,
      });
    }
  }

  private handleOpenTag(name: string) {
    this.state.currentTag = name;
    this.state.currentText = '';

    switch (name) {
      case 'historical_figure':
        this.state.inHistoricalFigure = true;
        this.state.currentFigure = { entityLinks: [], hfLinks: [], hfSkills: [], spheres: [] };
        break;
      case 'historical_event':
        this.state.inHistoricalEvent = true;
        this.state.currentEvent = {};
        break;
      case 'site':
        this.state.inSite = true;
        this.state.currentSite = {};
        break;
      case 'entity':
        this.state.inEntity = true;
        this.state.currentEntity = {};
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
    
    // Parse historical figures
    if (this.state.inHistoricalFigure) {
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
          this.state.currentFigure.appeared = parseInt(text, 10);
          break;
        case 'birth_year':
          this.state.currentFigure.birthYear = parseInt(text, 10);
          break;
        case 'birth_seconds72':
          this.state.currentFigure.birthSeconds72 = parseInt(text, 10);
          break;
        case 'death_year':
          this.state.currentFigure.deathYear = parseInt(text, 10);
          break;
        case 'death_seconds72':
          this.state.currentFigure.deathSeconds72 = parseInt(text, 10);
          break;
        case 'associated_type':
          this.state.currentFigure.associatedType = text;
          break;
        case 'holds_artifact':
          this.state.currentFigure.holdsArtifact = parseInt(text, 10);
          break;
        case 'sphere':
          this.state.currentFigure.spheres.push(text);
          break;
        case 'link_type':
          if (this.state.inEntityLink) {
            this.state.currentFigure.entityLinks.push({ linkType: text });
          } else if (this.state.inHfLink) {
            this.state.currentFigure.hfLinks.push({ linkType: text });
          }
          break;
        case 'entity_id':
          if (this.state.currentFigure.entityLinks.length > 0) {
            this.state.currentFigure.entityLinks[this.state.currentFigure.entityLinks.length - 1].entityId = parseInt(text, 10);
          }
          break;
        case 'hfid':
          if (this.state.inHfLink && this.state.currentFigure.hfLinks.length > 0) {
            this.state.currentFigure.hfLinks[this.state.currentFigure.hfLinks.length - 1].hfid = parseInt(text, 10);
          }
          break;
        case 'skill':
          if (this.state.inHfSkill) {
            this.state.currentFigure.hfSkills.push({ skill: text });
          }
          break;
        case 'total_ip':
          if (this.state.inHfSkill && this.state.currentFigure.hfSkills.length > 0) {
            this.state.currentFigure.hfSkills[this.state.currentFigure.hfSkills.length - 1].totalIp = parseInt(text, 10);
          }
          break;
        case 'historical_figure':
          this.state.inHistoricalFigure = false;
          this.figures.push({
            ...this.state.currentFigure,
            kills: [],
          } as HistoricalFigure);
          break;
        case 'entity_link':
          this.state.inEntityLink = false;
          break;
        case 'hf_link':
          this.state.inHfLink = false;
          break;
        case 'hf_skill':
          this.state.inHfSkill = false;
          break;
      }
    }

    // Parse historical events
    if (this.state.inHistoricalEvent) {
      switch (name) {
        case 'id':
          this.state.currentEvent.id = parseInt(text, 10);
          break;
        case 'year':
          this.state.currentEvent.year = parseInt(text, 10);
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
        case 'slayer_hfid':
          this.state.currentEvent.slayerHfid = parseInt(text, 10);
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
        case 'site_id':
          this.state.currentEvent.siteId = parseInt(text, 10);
          break;
        case 'subregion_id':
          this.state.currentEvent.subregionId = parseInt(text, 10);
          break;
        case 'feature_layer_id':
          this.state.currentEvent.featureLayerId = parseInt(text, 10);
          break;
        case 'coords':
          this.state.currentEvent.coords = text;
          break;
        case 'subtype':
          this.state.currentEvent.subtype = text;
          break;
        case 'group_1_hfid':
          this.state.currentEvent.group1Hfid = parseInt(text, 10);
          break;
        case 'group_2_hfid':
          this.state.currentEvent.group2Hfid = parseInt(text, 10);
          break;
        case 'civ_id':
          this.state.currentEvent.civId = parseInt(text, 10);
          break;
        case 'link':
          this.state.currentEvent.link = text;
          break;
        case 'state':
          this.state.currentEvent.state = text;
          break;
        case 'historical_event':
          this.state.inHistoricalEvent = false;
          this.events.push(this.state.currentEvent as HistoricalEvent);
          break;
      }
    }

    // Parse sites
    if (this.state.inSite) {
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

    // Parse entities
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
        case 'entity':
          this.state.inEntity = false;
          this.entities.push(this.state.currentEntity as Entity);
          break;
      }
    }

    this.state.currentText = '';
  }

  finalize(): { figures: HistoricalFigure[]; events: HistoricalEvent[]; sites: Site[]; entities: Entity[] } {
    return {
      figures: this.figures,
      events: this.events,
      sites: this.sites,
      entities: this.entities,
    };
  }
}
