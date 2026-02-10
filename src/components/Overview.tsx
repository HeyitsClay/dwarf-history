import { useEffect, useState, useMemo } from 'react';
import { db } from '../db/database';
import type { HistoricalFigure, Entity } from '../types';

interface OverviewProps {
  onViewFigures: () => void;
  onViewFigure: (id: number) => void;
  onNewWorld: () => void;
}

export const Overview = ({ onNewWorld }: OverviewProps) => {
  const [worldName, setWorldName] = useState<string>('');
  const [year, setYear] = useState<number>(0);
  const [livingCount, setLivingCount] = useState(0);
  const [totalDeaths, setTotalDeaths] = useState(0);
  const [topKiller, setTopKiller] = useState<HistoricalFigure | null>(null);
  const [strongestCiv, setStrongestCiv] = useState<{ entity: Entity; members: number; living: number; kills: number; artifacts: number; power: number } | null>(null);
  const [raceStats, setRaceStats] = useState<{ race: string; count: number; living: number; kills: number; deaths: number; category: 'civilized' | 'monster' | 'animal' | 'other' }[]>([]);
  const [artifactHolders, setArtifactHolders] = useState<{ entity: Entity; count: number; percentage: number }[]>([]);
  const [topDeities, setTopDeities] = useState<{ name: string; worshippers: number }[]>([]);
  const [loadingStage, setLoadingStage] = useState('Initializing...');
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    
    const loadData = async () => {
      try {
        setLoadingStage('Loading metadata...');
        setLoadingProgress(10);
        const meta = await db.getMetadata();
        if (isCancelled) return;
        setWorldName(meta?.name || 'Unknown World');
        setYear(meta?.year || 0);

        setLoadingStage('Loading figures...');
        setLoadingProgress(30);
        
        const totalFigures = await db.figures.count();
        const batchSize = 2000;
        const allFigures: HistoricalFigure[] = [];
        
        for (let offset = 0; offset < totalFigures; offset += batchSize) {
          if (isCancelled) return;
          const batch = await db.figures.offset(offset).limit(batchSize).toArray();
          allFigures.push(...batch);
          setLoadingProgress(30 + Math.floor((offset / totalFigures) * 50));
          await new Promise(r => setTimeout(r, 0));
        }

        const living = allFigures.filter(f => f.deathYear <= 0);
        const dead = allFigures.filter(f => f.deathYear > 0);
        setLivingCount(living.length);
        setTotalDeaths(dead.length);

        setLoadingStage('Finding legends...');
        setLoadingProgress(85);
        await new Promise(r => setTimeout(r, 0));
        
        const sortedKillers = allFigures.length > 0
          ? allFigures
              .filter(f => (f.kills?.length || 0) > 0)
              .sort((a, b) => (b.kills?.length || 0) - (a.kills?.length || 0))
          : [];
        setTopKiller(sortedKillers[0] || null);

        const allEntities = await db.entities.toArray();
        
        // Calculate artifacts held by each entity
        const entityArtifacts = new Map<number, number>();
        allFigures.forEach(f => {
          if (f.holdsArtifact !== undefined && f.holdsArtifact >= 0) {
            // Figure holds artifact directly - check their entity links
            f.entityLinks?.forEach(link => {
              if (link.linkType === 'member' || link.linkType === 'ruler') {
                entityArtifacts.set(link.entityId, (entityArtifacts.get(link.entityId) || 0) + 1);
              }
            });
          }
        });
        
        // Calculate dominant civilization with new formula
        const civs = allEntities
          .filter(e => e.name && (!e.type || e.type === 'civilization'))
          .map(entity => {
            const civMembers = allFigures.filter(f => 
              f.entityLinks?.some(l => l.entityId === entity.id && (l.linkType === 'member' || l.linkType === 'ruler'))
            );
            const living = civMembers.filter(f => f.deathYear <= 0).length;
            const kills = civMembers.reduce((sum, f) => sum + (f.kills?.length || 0), 0);
            const artifacts = entityArtifacts.get(entity.id) || 0;
            // Power formula: living members + (kills * 0.5) + (artifacts * 10)
            const power = Math.round(living + (kills * 0.5) + (artifacts * 10));
            return { 
              entity, 
              members: civMembers.length, 
              living, 
              kills, 
              artifacts,
              power 
            };
          })
          .filter(c => c.members > 0)
          .sort((a, b) => b.power - a.power);
        setStrongestCiv(civs[0] || null);

        // Top artifact holders
        const totalArtifacts = allFigures.filter(f => f.holdsArtifact !== undefined && f.holdsArtifact >= 0).length;
        const topArtifactHolders = civs
          .filter(c => c.artifacts > 0)
          .slice(0, 6)
          .map(c => ({
            entity: c.entity,
            count: c.artifacts,
            percentage: totalArtifacts > 0 ? (c.artifacts / totalArtifacts) * 100 : 0
          }));
        setArtifactHolders(topArtifactHolders);

        // Top deities (entities with worshipper links)
        const deityWorship = new Map<string, number>();
        allFigures.forEach(f => {
          f.entityLinks?.forEach(link => {
            if (link.linkType === 'worship' || link.linkType === 'deity') {
              const entity = allEntities.find(e => e.id === link.entityId);
              if (entity?.name) {
                deityWorship.set(entity.name, (deityWorship.get(entity.name) || 0) + 1);
              }
            }
          });
        });
        const sortedDeities = Array.from(deityWorship.entries())
          .map(([name, count]) => ({ name, worshippers: count }))
          .sort((a, b) => b.worshippers - a.worshippers)
          .slice(0, 6);
        setTopDeities(sortedDeities);

        // Categorize races
        const civilizedRaces = ['DWARF', 'HUMAN', 'ELF', 'GOBLIN'];
        const monsterRaces = ['TROLL', 'OGRE', 'MINOTAUR', 'ETTIN', 'GIANT', 'CYCLOPS', 'HYDRA', 'DRAGON', 'ROCA', 'DEMON', 'NIGHT_CREATURE', 'BOGEYMAN', 'VAMPIRE', 'WEREBEAST', 'FORGOTTEN_BEAST', 'TITAN', 'COLOSSUS'];
        const animalRaces = ['WOLF', 'BEAR', 'LION', 'TIGER', 'LEOPARD', 'JAGUAR', 'ELEPHANT', 'RHINOCEROS', 'HIPPO', 'CROCODILE', 'ALLIGATOR', 'GORILLA', 'BABOON', 'MONKEY', 'DEER', 'ELK', 'MOOSE', 'CARIBOU', 'BISON', 'BUFFALO', 'YAK', 'COW', 'BULL', 'HORSE', 'DONKEY', 'MULE', 'CAMEL', 'LLAMA', 'ALPACA', 'SHEEP', 'GOAT', 'PIG', 'BOAR', 'DOG', 'CAT', 'RAT', 'BAT', 'BIRD'];
        
        const getCategory = (race: string): 'civilized' | 'monster' | 'animal' | 'other' => {
          const upperRace = race.toUpperCase();
          if (civilizedRaces.includes(upperRace)) return 'civilized';
          if (monsterRaces.some(m => upperRace.includes(m))) return 'monster';
          if (animalRaces.some(a => upperRace.includes(a))) return 'animal';
          return 'other';
        };

        const raceMap = new Map<string, { count: number; living: number; kills: number; deaths: number; category: 'civilized' | 'monster' | 'animal' | 'other' }>();
        
        allFigures.forEach(f => {
          if (!f.race) return;
          const current = raceMap.get(f.race) || { count: 0, living: 0, kills: 0, deaths: 0, category: getCategory(f.race) };
          current.count++;
          if (f.deathYear <= 0) {
            current.living++;
          } else {
            current.deaths++;
          }
          current.kills += f.kills?.length || 0;
          raceMap.set(f.race, current);
        });
        
        // Aggregate by category
        const civilizedRaceList = ['DWARF', 'HUMAN', 'ELF', 'GOBLIN'];
        let monsterTotal = { race: 'Monsters', count: 0, living: 0, kills: 0, deaths: 0, category: 'civilized' as const };
        let wildlifeTotal = { race: 'Wildlife', count: 0, living: 0, kills: 0, deaths: 0, category: 'civilized' as const };
        
        const raceList: { race: string; count: number; living: number; kills: number; deaths: number; category: 'civilized' | 'monster' | 'animal' | 'other' }[] = [];
        
        raceMap.forEach((data, raceName) => {
          if (civilizedRaceList.includes(raceName)) {
            raceList.push({ race: raceName, ...data });
          } else if (data.category === 'monster') {
            monsterTotal.count += data.count;
            monsterTotal.living += data.living;
            monsterTotal.kills += data.kills;
            monsterTotal.deaths += data.deaths;
          } else if (data.category === 'animal') {
            wildlifeTotal.count += data.count;
            wildlifeTotal.living += data.living;
            wildlifeTotal.kills += data.kills;
            wildlifeTotal.deaths += data.deaths;
          }
        });
        
        // Sort civilized: DWARF, HUMAN, ELF, GOBLIN
        raceList.sort((a, b) => civilizedRaceList.indexOf(a.race) - civilizedRaceList.indexOf(b.race));
        
        // Add aggregates if they have population
        if (monsterTotal.count > 0) raceList.push(monsterTotal);
        if (wildlifeTotal.count > 0) raceList.push(wildlifeTotal);
        
        setRaceStats(raceList);
        setLoadingProgress(100);

      } catch (err) {
        console.error('Overview error:', err);
        setLoadingStage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setLoadingProgress(100);
      }
    };

    loadData();
    return () => { isCancelled = true; };
  }, []);

  // Calculate percentages based on LIVING population only
  const racePercentages = useMemo(() => {
    if (livingCount === 0) return [];
    return raceStats.map(r => ({
      ...r,
      percentage: (r.living / livingCount) * 100
    }));
  }, [raceStats, livingCount]);

  if (loadingProgress < 100 || loadingStage.includes('Error')) {
    const isError = loadingStage.includes('Error');
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-logo">⚒️</div>
          <p className={`loading-stage ${isError ? 'error' : ''}`}>{loadingStage}</p>
          {!isError && (
            <div className="loading-bar">
              <div className="loading-fill" style={{ width: `${loadingProgress}%` }} />
            </div>
          )}
          {isError && (
            <button className="btn-retry" onClick={() => window.location.reload()}>
              Reload
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overview-dashboard">
      {/* World Name & Year */}
      <section className="world-header">
        <h1 className="world-title">{worldName}</h1>
        {year > 0 && <div className="world-year-display">Year {year}</div>}
      </section>

      {/* The Count */}
      <section className="count-section">
        <div className="count-grid">
          <div className="count-item">
            <span className="count-number living">{livingCount.toLocaleString()}</span>
            <span className="count-label">Alive</span>
          </div>
          <div className="count-divider">/</div>
          <div className="count-item">
            <span className="count-number dead">{totalDeaths.toLocaleString()}</span>
            <span className="count-label">Fallen</span>
          </div>
          <div className="count-divider">/</div>
          <div className="count-item">
            <span className="count-number total">{(livingCount + totalDeaths).toLocaleString()}</span>
            <span className="count-label">Total</span>
          </div>
        </div>
      </section>

      {/* Legends */}
      <section className="legends-section">
        {topKiller && (
          <div className="legend-block killer-highlight">
            <div className="legend-header">
              <span className="legend-icon">🗡️</span>
              <span className="legend-title">Deadliest Figure</span>
            </div>
            <div className="legend-content">
              <div className="legend-kill-count">{topKiller.kills?.length || 0}</div>
              <div className="legend-kill-label">kills</div>
              <div className="legend-name">{topKiller.name}</div>
              <div className="legend-meta">{topKiller.race}</div>
            </div>
          </div>
        )}
        
        {strongestCiv && (
          <div className="legend-block civ-highlight">
            <div className="legend-header">
              <span className="legend-icon">👑</span>
              <span className="legend-title">Dominant Civilization</span>
            </div>
            <div className="legend-content">
              <div className="legend-name">{strongestCiv.entity.name}</div>
              <div className="legend-stats">
                <div className="civ-stat">
                  <span className="civ-stat-value">{strongestCiv.living.toLocaleString()}</span>
                  <span className="civ-stat-label">living</span>
                </div>
                <div className="civ-stat">
                  <span className="civ-stat-value">{strongestCiv.kills.toLocaleString()}</span>
                  <span className="civ-stat-label">kills</span>
                </div>
                <div className="civ-stat">
                  <span className="civ-stat-value">{strongestCiv.artifacts.toLocaleString()}</span>
                  <span className="civ-stat-label">artifacts</span>
                </div>
              </div>
              <div className="legend-meta">Power Score: {strongestCiv.power}</div>
            </div>
          </div>
        )}
      </section>

      {/* Stats Grid - 3 Columns */}
      {racePercentages.length > 0 && (
        <section className="stats-grid">
          {/* Population Column */}
          <div className="stats-column">
            <h3 className="section-header">Living</h3>
            <div className="stats-bars">
              {racePercentages.map(({ race, living, percentage }) => {
                let color = '#6b6b6b';
                if (race === 'DWARF') color = '#d4a373';
                else if (race === 'HUMAN') color = '#2a9d8f';
                else if (race === 'ELF') color = '#e9c46a';
                else if (race === 'GOBLIN') color = '#e76f51';
                else if (race === 'Monsters') color = '#9b2226';
                else if (race === 'Wildlife') color = '#6b6b6b';
                
                return (
                  <div key={`pop-${race}`} className="stat-bar">
                    <div className="stat-label-row">
                      <span className="stat-name">{race}</span>
                      <span className="stat-value">{living.toLocaleString()}</span>
                    </div>
                    <div className="stat-track">
                      <div 
                        className="stat-fill"
                        style={{ width: `${Math.max(percentage, 1)}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="stat-percent">{percentage.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Kills Column */}
          <div className="stats-column">
            <h3 className="section-header">Kills</h3>
            <div className="stats-bars">
              {(() => {
                const totalKills = racePercentages.reduce((sum, r) => sum + r.kills, 0);
                return racePercentages.map(({ race, kills }) => {
                  const killPercent = totalKills > 0 ? (kills / totalKills) * 100 : 0;
                  let color = '#6b6b6b';
                  if (race === 'DWARF') color = '#d4a373';
                  else if (race === 'HUMAN') color = '#2a9d8f';
                  else if (race === 'ELF') color = '#e9c46a';
                  else if (race === 'GOBLIN') color = '#e76f51';
                  else if (race === 'Monsters') color = '#9b2226';
                  else if (race === 'Wildlife') color = '#6b6b6b';
                  
                  return (
                    <div key={`kill-${race}`} className="stat-bar">
                      <div className="stat-label-row">
                        <span className="stat-name">{race}</span>
                        <span className="stat-value kill">{kills.toLocaleString()}</span>
                      </div>
                      <div className="stat-track">
                        <div 
                          className="stat-fill"
                          style={{ width: `${Math.max(killPercent, 1)}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="stat-percent">{killPercent.toFixed(1)}%</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Deaths Column */}
          <div className="stats-column">
            <h3 className="section-header">Deaths</h3>
            <div className="stats-bars">
              {(() => {
                const totalDeathsByRace = racePercentages.reduce((sum, r) => sum + r.deaths, 0);
                return racePercentages.map(({ race, deaths }) => {
                  const deathPercent = totalDeathsByRace > 0 ? (deaths / totalDeathsByRace) * 100 : 0;
                  let color = '#6b6b6b';
                  if (race === 'DWARF') color = '#d4a373';
                  else if (race === 'HUMAN') color = '#2a9d8f';
                  else if (race === 'ELF') color = '#e9c46a';
                  else if (race === 'GOBLIN') color = '#e76f51';
                  else if (race === 'Monsters') color = '#9b2226';
                  else if (race === 'Wildlife') color = '#6b6b6b';
                  
                  return (
                    <div key={`death-${race}`} className="stat-bar">
                      <div className="stat-label-row">
                        <span className="stat-name">{race}</span>
                        <span className="stat-value dead">{deaths.toLocaleString()}</span>
                      </div>
                      <div className="stat-track">
                        <div 
                          className="stat-fill"
                          style={{ width: `${Math.max(deathPercent, 1)}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="stat-percent">{deathPercent.toFixed(1)}%</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </section>
      )}

      {/* New Row - Artifacts & Deities */}
      <section className="info-row">
        {/* Artifact Holders */}
        {artifactHolders.length > 0 && (
          <div className="info-card">
            <div className="info-header">
              <span className="info-icon">💎</span>
              <span className="info-title">Artifact Keepers</span>
            </div>
            <div className="info-list">
              {artifactHolders.map((holder, idx) => (
                <div key={idx} className="info-item">
                  <span className="info-name">{holder.entity.name}</span>
                  <span className="info-value">{holder.count} ({holder.percentage.toFixed(1)}%)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Deities */}
        {topDeities.length > 0 && (
          <div className="info-card">
            <div className="info-header">
              <span className="info-icon">✨</span>
              <span className="info-title">Most Worshipped</span>
            </div>
            <div className="info-list">
              {topDeities.map((deity, idx) => (
                <div key={idx} className="info-item">
                  <span className="info-name">{deity.name}</span>
                  <span className="info-value">{deity.worshippers.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Action */}
      <section className="action-section">
        <button className="btn-new-world" onClick={onNewWorld}>
          Load Different World
        </button>
      </section>
    </div>
  );
};
