import Dexie, { type Table } from 'dexie';
import type {
  HistoricalFigure, HistoricalEvent, Site, Entity, Artifact,
  Region, UndergroundRegion, EventCollection, WrittenContent, WorldMetadata
} from '../types';

console.log('Database: Initializing...');

export class DwarfHistoryDB extends Dexie {
  // Pass 1: Static reference data
  regions!: Table<Region, number>;
  undergroundRegions!: Table<UndergroundRegion, number>;
  sites!: Table<Site, number>;
  figures!: Table<HistoricalFigure, number>;
  entities!: Table<Entity, number>;
  artifacts!: Table<Artifact, number>;
  writtenContents!: Table<WrittenContent, number>;
  
  // Pass 2 & 3: Events and collections
  events!: Table<HistoricalEvent, number>;
  eventCollections!: Table<EventCollection, number>;
  
  // Metadata
  metadata!: Table<WorldMetadata, string>;

  constructor() {
    super('DwarfHistoryDB');
    console.log('Database: Setting up schema v2...');
    
    this.version(2).stores({
      // Pass 1 tables
      regions: 'id, name, type',
      undergroundRegions: 'id, type, depth',
      sites: 'id, name, type, coords.x, coords.y',
      figures: 'id, name, race, deathYear, birthYear, isAlive, [name+race]',
      entities: 'id, name, race, type',
      artifacts: 'id, name, itemType, creatorHfid, holderHfid, siteId, currentStatus',
      writtenContents: 'id, title, type, authorHfid',
      
      // Pass 2 & 3 tables
      events: 'id, year, type, hfid, siteId, entityId, artifactId, collectionId, [type+hfid], [type+siteId]',
      eventCollections: 'id, type, startYear, endYear, aggressorEntityId, defenderEntityId, beastHfid',
      
      // Metadata
      metadata: 'name',
    });
    
    console.log('Database: Schema ready');
  }

  async clearAll(): Promise<void> {
    await this.regions.clear();
    await this.undergroundRegions.clear();
    await this.sites.clear();
    await this.figures.clear();
    await this.entities.clear();
    await this.artifacts.clear();
    await this.writtenContents.clear();
    await this.events.clear();
    await this.eventCollections.clear();
    await this.metadata.clear();
  }

  async hasData(): Promise<boolean> {
    try {
      const count = await this.figures.count();
      return count > 0;
    } catch (e) {
      console.error('Database: Error checking data:', e);
      return false;
    }
  }

  async getMetadata(): Promise<WorldMetadata | undefined> {
    try {
      return await this.metadata.toCollection().first();
    } catch (e) {
      console.error('Database: Error getting metadata:', e);
      return undefined;
    }
  }

  // Bulk insert methods with batching
  async bulkAddRegions(items: Region[], progressCallback?: (count: number) => void): Promise<void> {
    const valid = items.filter(i => i.id != null && !isNaN(i.id));
    const unique = Array.from(new Map(valid.map(i => [i.id, i])).values());
    const batchSize = 500;
    for (let i = 0; i < unique.length; i += batchSize) {
      await this.regions.bulkPut(unique.slice(i, i + batchSize));
      if (progressCallback) progressCallback(Math.min(i + batchSize, unique.length));
    }
  }

  async bulkAddUndergroundRegions(items: UndergroundRegion[], progressCallback?: (count: number) => void): Promise<void> {
    const valid = items.filter(i => i.id != null && !isNaN(i.id));
    const unique = Array.from(new Map(valid.map(i => [i.id, i])).values());
    const batchSize = 500;
    for (let i = 0; i < unique.length; i += batchSize) {
      await this.undergroundRegions.bulkPut(unique.slice(i, i + batchSize));
      if (progressCallback) progressCallback(Math.min(i + batchSize, unique.length));
    }
  }

  async bulkAddSites(items: Site[], progressCallback?: (count: number) => void): Promise<void> {
    const valid = items.filter(i => i.id != null && !isNaN(i.id));
    const unique = Array.from(new Map(valid.map(i => [i.id, i])).values());
    const batchSize = 500;
    for (let i = 0; i < unique.length; i += batchSize) {
      await this.sites.bulkPut(unique.slice(i, i + batchSize));
      if (progressCallback) progressCallback(Math.min(i + batchSize, unique.length));
    }
  }

  async bulkAddFigures(items: HistoricalFigure[], progressCallback?: (count: number) => void): Promise<void> {
    const valid = items.filter(i => i.id != null && !isNaN(i.id));
    const unique = Array.from(new Map(valid.map(i => [i.id, i])).values());
    const batchSize = 500;
    for (let i = 0; i < unique.length; i += batchSize) {
      await this.figures.bulkPut(unique.slice(i, i + batchSize));
      if (progressCallback) progressCallback(Math.min(i + batchSize, unique.length));
    }
  }

  async bulkAddEntities(items: Entity[], progressCallback?: (count: number) => void): Promise<void> {
    const valid = items.filter(i => i.id != null && !isNaN(i.id));
    const unique = Array.from(new Map(valid.map(i => [i.id, i])).values());
    const batchSize = 500;
    for (let i = 0; i < unique.length; i += batchSize) {
      await this.entities.bulkPut(unique.slice(i, i + batchSize));
      if (progressCallback) progressCallback(Math.min(i + batchSize, unique.length));
    }
  }

  async bulkAddArtifacts(items: Artifact[], progressCallback?: (count: number) => void): Promise<void> {
    const valid = items.filter(i => i.id != null && !isNaN(i.id));
    const unique = Array.from(new Map(valid.map(i => [i.id, i])).values());
    const batchSize = 500;
    for (let i = 0; i < unique.length; i += batchSize) {
      await this.artifacts.bulkPut(unique.slice(i, i + batchSize));
      if (progressCallback) progressCallback(Math.min(i + batchSize, unique.length));
    }
  }

  async bulkAddWrittenContents(items: WrittenContent[], progressCallback?: (count: number) => void): Promise<void> {
    const valid = items.filter(i => i.id != null && !isNaN(i.id));
    const unique = Array.from(new Map(valid.map(i => [i.id, i])).values());
    const batchSize = 500;
    for (let i = 0; i < unique.length; i += batchSize) {
      await this.writtenContents.bulkPut(unique.slice(i, i + batchSize));
      if (progressCallback) progressCallback(Math.min(i + batchSize, unique.length));
    }
  }

  async bulkAddEvents(items: HistoricalEvent[], progressCallback?: (count: number) => void): Promise<void> {
    const valid = items.filter(i => i.id != null && !isNaN(i.id));
    const unique = Array.from(new Map(valid.map(i => [i.id, i])).values());
    const batchSize = 500;
    for (let i = 0; i < unique.length; i += batchSize) {
      await this.events.bulkPut(unique.slice(i, i + batchSize));
      if (progressCallback) progressCallback(Math.min(i + batchSize, unique.length));
    }
  }

  async bulkAddEventCollections(items: EventCollection[], progressCallback?: (count: number) => void): Promise<void> {
    const valid = items.filter(i => i.id != null && !isNaN(i.id));
    const unique = Array.from(new Map(valid.map(i => [i.id, i])).values());
    const batchSize = 500;
    for (let i = 0; i < unique.length; i += batchSize) {
      await this.eventCollections.bulkPut(unique.slice(i, i + batchSize));
      if (progressCallback) progressCallback(Math.min(i + batchSize, unique.length));
    }
  }

  async exportToJSON(): Promise<string> {
    const data = {
      metadata: await this.metadata.toArray(),
      regions: await this.regions.toArray(),
      undergroundRegions: await this.undergroundRegions.toArray(),
      sites: await this.sites.toArray(),
      figures: await this.figures.toArray(),
      entities: await this.entities.toArray(),
      artifacts: await this.artifacts.toArray(),
      writtenContents: await this.writtenContents.toArray(),
      events: await this.events.toArray(),
      eventCollections: await this.eventCollections.toArray(),
    };
    return JSON.stringify(data, null, 2);
  }

  async importFromJSON(jsonStr: string): Promise<void> {
    const data = JSON.parse(jsonStr);
    await this.clearAll();
    if (data.metadata) await this.metadata.bulkPut(data.metadata);
    if (data.regions) await this.bulkAddRegions(data.regions);
    if (data.undergroundRegions) await this.bulkAddUndergroundRegions(data.undergroundRegions);
    if (data.sites) await this.bulkAddSites(data.sites);
    if (data.figures) await this.bulkAddFigures(data.figures);
    if (data.entities) await this.bulkAddEntities(data.entities);
    if (data.artifacts) await this.bulkAddArtifacts(data.artifacts);
    if (data.writtenContents) await this.bulkAddWrittenContents(data.writtenContents);
    if (data.events) await this.bulkAddEvents(data.events);
    if (data.eventCollections) await this.bulkAddEventCollections(data.eventCollections);
  }
}

// Singleton instance
export const db = new DwarfHistoryDB();

// Storage guard function
export async function checkStorage(): Promise<{ ok: boolean; warning?: string }> {
  if (!navigator.storage || !navigator.storage.estimate) {
    return { ok: true };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const available = quota - used;

    if (available < 500 * 1024 * 1024) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      return {
        ok: false,
        warning: isIOS 
          ? 'iOS Safari has limited storage (~50MB). Large Legends files may fail.'
          : `Limited storage available (${Math.round(available / 1024 / 1024)}MB).`,
      };
    }

    return { ok: true };
  } catch (e) {
    return { ok: true };
  }
}
