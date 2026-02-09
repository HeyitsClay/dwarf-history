import Dexie, { type Table } from 'dexie';
import type { HistoricalFigure, HistoricalEvent, Site, Entity, WorldMetadata } from '../types';

console.log('Database: Initializing...');

export class DwarfHistoryDB extends Dexie {
  figures!: Table<HistoricalFigure, number>;
  events!: Table<HistoricalEvent, number>;
  sites!: Table<Site, number>;
  entities!: Table<Entity, number>;
  metadata!: Table<WorldMetadata, string>;

  constructor() {
    super('DwarfHistoryDB');
    console.log('Database: Setting up schema...');
    
    this.version(1).stores({
      figures: 'id, name, race, deathYear, [name+race]',
      events: 'id, year, type, slayerHfid, hfid, [type+slayerHfid]',
      sites: 'id, name, type',
      entities: 'id, name, race',
      metadata: 'name',
    });
    
    console.log('Database: Schema ready');
  }

  async clearAll(): Promise<void> {
    await this.figures.clear();
    await this.events.clear();
    await this.sites.clear();
    await this.entities.clear();
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

  async bulkAddFigures(figures: HistoricalFigure[], progressCallback?: (count: number) => void): Promise<void> {
    const batchSize = 500;
    for (let i = 0; i < figures.length; i += batchSize) {
      const batch = figures.slice(i, i + batchSize);
      await this.figures.bulkAdd(batch);
      if (progressCallback) {
        progressCallback(Math.min(i + batchSize, figures.length));
      }
    }
  }

  async bulkAddEvents(events: HistoricalEvent[], progressCallback?: (count: number) => void): Promise<void> {
    const batchSize = 500;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      await this.events.bulkAdd(batch);
      if (progressCallback) {
        progressCallback(Math.min(i + batchSize, events.length));
      }
    }
  }

  async exportToJSON(): Promise<string> {
    const data = {
      metadata: await this.metadata.toArray(),
      figures: await this.figures.toArray(),
      events: await this.events.toArray(),
      sites: await this.sites.toArray(),
      entities: await this.entities.toArray(),
    };
    return JSON.stringify(data, null, 2);
  }

  async importFromJSON(jsonStr: string): Promise<void> {
    const data = JSON.parse(jsonStr);
    await this.clearAll();
    if (data.metadata) await this.metadata.bulkAdd(data.metadata);
    if (data.figures) await this.figures.bulkAdd(data.figures);
    if (data.events) await this.events.bulkAdd(data.events);
    if (data.sites) await this.sites.bulkAdd(data.sites);
    if (data.entities) await this.entities.bulkAdd(data.entities);
  }
}

// Singleton instance
console.log('Database: Creating instance...');
export const db = new DwarfHistoryDB();
console.log('Database: Instance created successfully');

// Storage guard function
export async function checkStorage(): Promise<{ ok: boolean; warning?: string }> {
  console.log('Storage: Checking...');
  
  if (!navigator.storage || !navigator.storage.estimate) {
    console.log('Storage: API not available, skipping check');
    return { ok: true };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const available = quota - used;

    console.log(`Storage: ${Math.round(used/1024/1024)}MB used, ${Math.round(available/1024/1024)}MB available`);

    // Warn if less than 500MB available (hard Safari limit is around this)
    if (available < 500 * 1024 * 1024) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      return {
        ok: false,
        warning: isIOS 
          ? 'iOS Safari has limited storage (~50MB). Large Legends files may fail. Consider using Chrome/Edge on desktop.'
          : `Limited storage available (${Math.round(available / 1024 / 1024)}MB). Large files may cause issues.`,
      };
    }

    return { ok: true };
  } catch (e) {
    console.error('Storage: Error checking:', e);
    return { ok: true };
  }
}
