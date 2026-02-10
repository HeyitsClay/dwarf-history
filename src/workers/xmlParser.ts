/// <reference lib="webworker" />

import type { HistoricalFigure, HistoricalEvent, Site, Entity, Artifact } from '../types';

// Simple XML parser state machine
interface ParserState {
  inHistoricalFigure: boolean;
  inHistoricalEvent: boolean;
  inSite: boolean;
  inEntity: boolean;
  inArtifact: boolean;
  inArtifactLink: boolean;
  inWrittenContent: boolean;
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
  currentArtifact: Partial<Artifact>;
  currentWrittenContent: Partial<{
    id: number;
    title: string;
    type: string;
    authorHfid: number;
  }>;
}

class SimpleXmlParser {
  private figures: HistoricalFigure[] = [];
  private events: HistoricalEvent[] = [];
  private sites: Site[] = [];
  private entities: Entity[] = [];
  private artifacts: Artifact[] = [];
  private writtenContents: Map<number, { title: string; type: string; authorHfid: number }> = new Map();
  
  private state: ParserState;
  private totalBytes: number;
  private bytesProcessed = 0;
  private lastProgressUpdate = 0;

  constructor(totalBytes: number) {
    this.totalBytes = totalBytes;
    this.state = this.getInitialState();
  }

  private getInitialState(): ParserState {
    return {
      inHistoricalFigure: false,
      inHistoricalEvent: false,
      inSite: false,
      inEntity: false,
      inArtifact: false,
      inArtifactLink: false,
      inWrittenContent: false,
      inEntityLink: false,
      inHfLink: false,
      inHfSkill: false,
      currentTag: '',
      currentText: '',
      currentFigure: { entityLinks: [], hfLinks: [], hfSkills: [], spheres: [] },
      currentEvent: {},
      currentSite: {},
      currentEntity: {},
      currentArtifact: {},
      currentWrittenContent: {},
    };
  }

  parseChunk(chunk: string): void {
    this.bytesProcessed += chunk.length;
    
    // Fast tag parsing using indexOf instead of regex
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
      
      // Extract tag name (stop at first whitespace or />)
      let tagName = '';
      let nameEnd = isClosing ? 1 : 0;
      while (nameEnd < tagContent.length) {
        const c = tagContent.charCodeAt(nameEnd);
        if (c === 32 || c === 9 || c === 10 || c === 13 || c === 47) break; // whitespace or /
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
      self.postMessage({
        type: 'progress',
        progress,
        phase: 'parsing',
        counts: {
          figures: this.figures.length,
          events: this.events.length,
          sites: this.sites.length,
          entities: this.entities.length,
          artifacts: this.artifacts.length,
        },
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
      case 'artifact':
        this.state.inArtifact = true;
        this.state.currentArtifact = { ownerHistory: [] };
        break;
      case 'written_content':
        this.state.inWrittenContent = true;
        this.state.currentWrittenContent = {};
        break;
      case 'artifact_link':
        this.state.inArtifactLink = true;
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
    // Note: Check !inArtifact to avoid capturing artifact fields
    if (this.state.inHistoricalFigure && !this.state.inArtifact) {
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
            // Sanitize skill name - remove any XML artifacts and normalize
            let cleanSkill = text.replace(/<[^>]+>/g, '').trim();
            // Also remove '>' prefix that can occur from chunk boundaries
            cleanSkill = cleanSkill.replace(/^>/, '').trim();
            // Remove any remaining HTML entities
            cleanSkill = cleanSkill.replace(/&lt;[^&]+&gt;/g, '').trim();
            if (cleanSkill) {
              this.state.currentFigure.hfSkills.push({ skill: cleanSkill });
            }
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

    // Parse written content (for books/slabs)
    if (this.state.inWrittenContent) {
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
        case 'written_content':
          this.state.inWrittenContent = false;
          if (this.state.currentWrittenContent.id !== undefined) {
            this.writtenContents.set(this.state.currentWrittenContent.id, {
              title: this.state.currentWrittenContent.title || '',
              type: this.state.currentWrittenContent.type || '',
              authorHfid: this.state.currentWrittenContent.authorHfid || -1,
            });
          }
          break;
      }
    }

    // Parse artifacts
    if (this.state.inArtifact) {
      switch (name) {
        case 'id':
          this.state.currentArtifact.id = parseInt(text, 10);
          break;
        case 'name':
          this.state.currentArtifact.name = text;
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
        case 'creator_hfid':
          this.state.currentArtifact.creatorHfid = parseInt(text, 10);
          break;
        case 'holder_hfid':
          this.state.currentArtifact.holderHfid = parseInt(text, 10);
          break;
        case 'site_id':
          this.state.currentArtifact.siteId = parseInt(text, 10);
          break;
        case 'entity_id':
          this.state.currentArtifact.entityId = parseInt(text, 10);
          break;
        case 'is_relic':
          this.state.currentArtifact.isRelic = text === '1' || text.toLowerCase() === 'true';
          break;
        case 'is_named_after_slaying':
          this.state.currentArtifact.isNamedAfterSlaying = text === '1' || text.toLowerCase() === 'true';
          break;
        case 'slain_beast_name':
          this.state.currentArtifact.slainBeastName = text;
          break;
        case 'written_content_id':
          // Link to written content for books/slabs
          const wcId = parseInt(text, 10);
          const wc = this.writtenContents.get(wcId);
          if (wc) {
            this.state.currentArtifact.isWrittenContent = true;
            this.state.currentArtifact.writtenContentType = wc.type;
            this.state.currentArtifact.writtenContentTitle = wc.title;
          }
          break;
        case 'artifact':
          this.state.inArtifact = false;
          this.artifacts.push(this.state.currentArtifact as Artifact);
          break;
      }
    }

    this.state.currentText = '';
  }

  finalize(): { figures: HistoricalFigure[]; events: HistoricalEvent[]; sites: Site[]; entities: Entity[]; artifacts: Artifact[] } {
    return {
      figures: this.figures,
      events: this.events,
      sites: this.sites,
      entities: this.entities,
      artifacts: this.artifacts,
    };
  }
}

// Worker message handler
self.onmessage = async (e: MessageEvent) => {
  console.log('Worker: Received message', e.data.type);
  const { type, file } = e.data;

  if (type === 'parse') {
    try {
      console.log('Worker: Starting parse, file size:', file.size);
      const parser = new SimpleXmlParser(file.size);
      
      // Read file in chunks using FileReaderSync (available in workers)
      const chunkSize = 512 * 1024; // 512KB chunks - safer for large files
      const reader = new FileReaderSync();
      
      console.log('Worker: Reading file in chunks...');
      for (let offset = 0; offset < file.size; offset += chunkSize) {
        const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
        const text = reader.readAsText(chunk);
        parser.parseChunk(text);
      }
      console.log('Worker: File read complete, finalizing...');
      
      const result = parser.finalize();
      
      // Process kill relationships - filter out figures with invalid IDs first
      const validFigures = result.figures.filter(f => f.id != null && !isNaN(f.id));
      const figureMap = new Map(validFigures.map(f => [f.id, f]));
      
      // Index deaths and assign kills
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
      
      // Calculate ages for figures - use reduce instead of spread to avoid stack overflow
      const validEvents = result.events.filter(e => e.year != null && !isNaN(e.year) && e.year > 0);
      const maxYear = validEvents.length > 0 ? validEvents.reduce((max, e) => e.year > max ? e.year : max, 0) : 0;
      for (const figure of validFigures) {
        if (figure.deathYear > 0) {
          figure.age = figure.deathYear - figure.birthYear;
        } else if (figure.birthYear > 0) {
          figure.age = maxYear - figure.birthYear;
        }
      }
      
      // Filter out entries with invalid IDs before returning
      const cleanResult = {
        figures: validFigures,
        events: result.events.filter(e => e.id != null && !isNaN(e.id)),
        sites: result.sites.filter(s => s.id != null && !isNaN(s.id)),
        entities: result.entities.filter(en => en.id != null && !isNaN(en.id)),
        artifacts: result.artifacts.filter(a => a.id != null && !isNaN(a.id)),
      };
      
      self.postMessage({
        type: 'complete',
        data: cleanResult,
      });
    } catch (error) {
      self.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
};

export {};
