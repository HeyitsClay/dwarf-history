import { useEffect, useState, useMemo } from 'react';
import { db } from '../db/database';
import type { HistoricalFigure, WorldMetadata, Entity } from '../types';

interface OverviewProps {
  onViewFigures: () => void;
  onViewFigure: (id: number) => void;
  onNewWorld: () => void;
}

interface WarData {
  name: string;
  deaths: number;
  startYear: number;
}

interface DeathBreakdown {
  combat: number;
  oldAge: number;
  violence: number;
  accidents: number;
  other: number;
}

export const Overview = ({ onViewFigures, onViewFigure, onNewWorld }: OverviewProps) => {
  const [metadata, setMetadata] = useState<WorldMetadata | null>(null);
  const [currentYear, setCurrentYear] = useState(0);
  const [livingCount, setLivingCount] = useState(0);
  const [activityLevel, setActivityLevel] = useState<'peaceful' | 'active' | 'chaotic' | 'apocalypse'>('peaceful');
  const [topKillers, setTopKillers] = useState<HistoricalFigure[]>([]);
  const [topCivs, setTopCivs] = useState<{ entity: Entity; memberCount: number; power: number }[]>([]);
  const [raceStats, setRaceStats] = useState<{ race: string; count: number; living: number }[]>([]);
  const [deathBreakdown, setDeathBreakdown] = useState<DeathBreakdown>({ combat: 0, oldAge: 0, violence: 0, accidents: 0, other: 0 });
  const [wars, setWars] = useState<WarData[]>([]);
  const [tripleThreat, setTripleThreat] = useState<{
    bloodiest: HistoricalFigure | null;
    strongest: Entity | null;
    hottestWar: WarData | null;
  }>({ bloodiest: null, strongest: null, hottestWar: null });
  const [loadingStage, setLoadingStage] = useState('Initializing...');
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    
    const loadData = async () => {
      try {
        // Stage 1: Metadata
        if (isCancelled) return;
        setLoadingStage('Loading metadata...');
        setLoadingProgress(10);
        const meta = await db.getMetadata();
        if (isCancelled) return;
        setMetadata(meta || null);

        // Stage 2: Get figures (limited for performance)
        setLoadingStage('Loading figures...');
        setLoadingProgress(20);
        
        // Get count first
        const totalFigures = await db.figures.count();
        
        // Load figures in batches to avoid blocking
        const batchSize = 1000;
        const allFigures: HistoricalFigure[] = [];
        
        for (let offset = 0; offset < totalFigures; offset += batchSize) {
          if (isCancelled) return;
          const batch = await db.figures.offset(offset).limit(batchSize).toArray();
          allFigures.push(...batch);
          setLoadingProgress(20 + Math.floor((offset / totalFigures) * 30));
          // Yield to main thread
          await new Promise(r => setTimeout(r, 0));
        }

        // Stage 3: Calculate year and living count
        setLoadingStage('Calculating world age...');
        setLoadingProgress(50);
        
        const maxYear = Math.max(...allFigures.map(f => f.deathYear > 0 ? f.deathYear : 0), 1);
        setCurrentYear(maxYear);
        
        const living = allFigures.filter(f => f.deathYear <= 0);
        setLivingCount(living.length);

        // Activity level - check recent deaths from figure data only (not all events)
        const recentDeaths = allFigures.filter(f => f.deathYear > maxYear - 50).length;
        if (recentDeaths > 1000) setActivityLevel('apocalypse');
        else if (recentDeaths > 500) setActivityLevel('chaotic');
        else if (recentDeaths > 100) setActivityLevel('active');
        else setActivityLevel('peaceful');

        // Stage 4: Top killers (limited to 10)
        setLoadingStage('Finding deadliest figures...');
        setLoadingProgress(60);
        await new Promise(r => setTimeout(r, 0));
        
        const sortedKillers = allFigures
          .filter(f => (f.kills?.length || 0) > 0)
          .sort((a, b) => (b.kills?.length || 0) - (a.kills?.length || 0))
          .slice(0, 10);
        setTopKillers(sortedKillers);

        // Bloodiest living
        const bloodiestLiving = allFigures
          .filter(f => f.deathYear <= 0 && f.kills && f.kills.length > 0)
          .sort((a, b) => (b.kills?.length || 0) - (a.kills?.length || 0))[0] || null;

        // Stage 5: Load entities
        setLoadingStage('Loading civilizations...');
        setLoadingProgress(70);
        await new Promise(r => setTimeout(r, 0));
        
        const allEntities = await db.entities.toArray();
        
        // Calculate civilization power (limited to top 10)
        const civPower = allEntities
          .filter(e => e.name)
          .map(entity => {
            const members = allFigures.filter(f => 
              f.entityLinks?.some(l => l.entityId === entity.id && (l.linkType === 'member' || l.linkType === 'ruler'))
            ).length;
            const power = Math.round(members / 10);
            return { entity, memberCount: members, power };
          })
          .filter(c => c.memberCount > 0)
          .sort((a, b) => b.power - a.power)
          .slice(0, 10);
        setTopCivs(civPower);

        const strongest = civPower[0]?.entity || null;

        // Stage 6: Race statistics
        setLoadingStage('Analyzing demographics...');
        setLoadingProgress(80);
        await new Promise(r => setTimeout(r, 0));
        
        const raceMap = new Map<string, { count: number; living: number }>();
        allFigures.forEach(f => {
          const current = raceMap.get(f.race) || { count: 0, living: 0 };
          current.count++;
          if (f.deathYear <= 0) current.living++;
          raceMap.set(f.race, current);
        });
        
        // Prioritize DWARF, HUMAN, ELF first, then sort rest by count
        const priorityRaces = ['DWARF', 'HUMAN', 'ELF'];
        const allRaces = Array.from(raceMap.entries()).map(([race, data]) => ({ race, ...data }));
        
        const prioritizedRaces = allRaces
          .filter(r => priorityRaces.includes(r.race))
          .sort((a, b) => priorityRaces.indexOf(a.race) - priorityRaces.indexOf(b.race));
        
        const otherRaces = allRaces
          .filter(r => !priorityRaces.includes(r.race))
          .sort((a, b) => b.count - a.count);
        
        setRaceStats([...prioritizedRaces, ...otherRaces].slice(0, 10));

        // Stage 7: Death breakdown from figure data
        setLoadingStage('Analyzing deaths...');
        setLoadingProgress(90);
        await new Promise(r => setTimeout(r, 0));
        
        const killedFigures = allFigures.filter(f => f.killer);
        const breakdown: DeathBreakdown = { combat: 0, oldAge: 0, violence: 0, accidents: 0, other: 0 };
        
        killedFigures.forEach(f => {
          const cause = (f.killer?.cause || '').toLowerCase();
          if (cause.includes('struck') || cause.includes('shot') || cause.includes('combat') || cause.includes('battle')) {
            breakdown.combat++;
          } else if (cause.includes('old') || cause.includes('age')) {
            breakdown.oldAge++;
          } else if (cause.includes('murder') || cause.includes('executed') || cause.includes('torture')) {
            breakdown.violence++;
          } else if (cause.includes('fall') || cause.includes('drown') || cause.includes('fire')) {
            breakdown.accidents++;
          } else {
            breakdown.other++;
          }
        });
        setDeathBreakdown(breakdown);

        // Simplified wars from figure kills
        const warMap = new Map<string, WarData>();
        sortedKillers.forEach(killer => {
          if (killer.kills && killer.kills.length > 5) {
            warMap.set(killer.name, {
              name: `${killer.name}'s Campaign`,
              deaths: killer.kills.length,
              startYear: killer.kills[0]?.year || 1,
            });
          }
        });
        const sortedWars = Array.from(warMap.values())
          .sort((a, b) => b.deaths - a.deaths)
          .slice(0, 5);
        setWars(sortedWars);

        const hottestWar = sortedWars[0] || null;

        setTripleThreat({ bloodiest: bloodiestLiving, strongest, hottestWar });
        setLoadingProgress(100);

      } catch (err) {
        console.error('Overview loading error:', err);
        setLoadingStage('Error loading data. Please refresh.');
      }
    };

    loadData();
    
    return () => {
      isCancelled = true;
    };
  }, []);

  const activityColor = useMemo(() => ({
    peaceful: '#2a9d8f',
    active: '#e9c46a',
    chaotic: '#e76f51',
    apocalypse: '#9b2226',
  })[activityLevel], [activityLevel]);

  const activityText = useMemo(() => ({
    peaceful: 'Peaceful Era',
    active: 'Active Conflicts',
    chaotic: 'Widespread Chaos',
    apocalypse: 'Age of Apocalypse',
  })[activityLevel], [activityLevel]);

  if (loadingProgress < 100) {
    return (
      <div className="overview-loading">
        <p>{loadingStage}</p>
        <div className="loading-bar">
          <div className="loading-fill" style={{ width: `${loadingProgress}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="overview">
      {/* World Vitals */}
      <div className="overview-header">
        <h1>{metadata?.name || 'Unknown World'}</h1>
        
        <div className="world-vitals">
          <div className="vitals-row">
            <div className="vital-item">
              <span className="vital-label">Current Year</span>
              <span className="vital-value year">Year {currentYear}</span>
            </div>
            <div className="vital-item">
              <span className="vital-label">Living Population</span>
              <span className="vital-value living">{livingCount.toLocaleString()}</span>
            </div>
            <div className="vital-item activity">
              <span className="vital-label">World Status</span>
              <span className="vital-value status" style={{ color: activityColor }}>
                ● {activityText}
              </span>
            </div>
          </div>
        </div>

        {/* Triple Threat */}
        <div className="triple-threat">
          {tripleThreat.bloodiest && (
            <div className="threat-card blood">
              <div className="threat-icon">🩸</div>
              <div className="threat-label">Bloodiest Living</div>
              <div className="threat-name" onClick={() => onViewFigure(tripleThreat.bloodiest!.id)}>
                {tripleThreat.bloodiest.name}
              </div>
              <div className="threat-stat">{tripleThreat.bloodiest.kills?.length || 0} kills</div>
            </div>
          )}
          {tripleThreat.strongest && (
            <div className="threat-card power">
              <div className="threat-icon">👑</div>
              <div className="threat-label">Most Powerful Civ</div>
              <div className="threat-name">{tripleThreat.strongest.name}</div>
              <div className="threat-stat">Dominant Force</div>
            </div>
          )}
          {tripleThreat.hottestWar && (
            <div className="threat-card war">
              <div className="threat-icon">⚔️</div>
              <div className="threat-label">Hottest War</div>
              <div className="threat-name">{tripleThreat.hottestWar.name}</div>
              <div className="threat-stat">{tripleThreat.hottestWar.deaths} deaths</div>
            </div>
          )}
        </div>
      </div>

      <div className="overview-actions">
        <button className="btn-primary" onClick={onViewFigures}>
          📜 View All Figures
        </button>
        <button className="btn-secondary" onClick={onNewWorld}>
          🌍 Load New World
        </button>
      </div>

      {/* Trophy Hall */}
      <div className="overview-sections">
        {/* Top Killers */}
        <section className="overview-section">
          <h2>⚔️ Most Lethal Figures</h2>
          {topKillers.length > 0 ? (
            <ul className="killer-list">
              {topKillers.map((figure, idx) => (
                <li key={figure.id} className="killer-item" onClick={() => onViewFigure(figure.id)}>
                  <div className="killer-rank">#{idx + 1}</div>
                  <div className="killer-info">
                    <div className="killer-name">{figure.name}</div>
                    <div className="killer-race">{figure.race}</div>
                  </div>
                  <div className="killer-count">{figure.kills?.length || 0} kills</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No recorded kills in this world.</p>
          )}
        </section>

        {/* Bloodiest Wars */}
        <section className="overview-section">
          <h2>🔥 Bloodiest Wars</h2>
          {wars.length > 0 ? (
            <ul className="war-list">
              {wars.map((war, warIdx) => (
                <li key={warIdx} className="war-item">
                  <div className="war-rank">#{warIdx + 1}</div>
                  <div className="war-info">
                    <div className="war-name">{war.name}</div>
                    <div className="war-year">Since Year {war.startYear}</div>
                  </div>
                  <div className="war-deaths">{war.deaths.toLocaleString()} deaths</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No major wars recorded.</p>
          )}
        </section>

        {/* Civilization Power Rankings */}
        <section className="overview-section">
          <h2>🏛️ Civilization Power Rankings</h2>
          {topCivs.length > 0 ? (
            <ul className="civ-list">
              {topCivs.map((civ) => (
                <li key={civ.entity.id} className="civ-item">
                  <div className="civ-rank">
                    {civ.power >= 50 ? 'S' : civ.power >= 30 ? 'A' : civ.power >= 15 ? 'B' : civ.power >= 8 ? 'C' : civ.power >= 4 ? 'D' : 'F'}
                  </div>
                  <div className="civ-info">
                    <div className="civ-name">{civ.entity.name}</div>
                    <div className="civ-stats">{civ.memberCount} members</div>
                  </div>
                  <div className="civ-power">Power {civ.power}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No civilization data available.</p>
          )}
        </section>

        {/* Race Distribution */}
        <section className="overview-section">
          <h2>📊 Race Population Distribution</h2>
          {raceStats.length > 0 ? (
            <ul className="race-list">
              {raceStats.map(({ race, count, living }) => (
                <li key={race} className="race-item">
                  <span className="race-name">{race}</span>
                  <span className="race-living">{living.toLocaleString()} living</span>
                  <span className="race-count">{count.toLocaleString()} total</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No race data available.</p>
          )}
        </section>

        {/* Cause of Death Breakdown */}
        <section className="overview-section">
          <h2>💀 Cause of Death Breakdown</h2>
          <div className="death-breakdown">
            <DeathBar label="Combat" count={deathBreakdown.combat} color="#e76f51" />
            <DeathBar label="Old Age" count={deathBreakdown.oldAge} color="#2a9d8f" />
            <DeathBar label="Violence" count={deathBreakdown.violence} color="#9b2226" />
            <DeathBar label="Accidents" count={deathBreakdown.accidents} color="#e9c46a" />
            <DeathBar label="Other" count={deathBreakdown.other} color="#808080" />
          </div>
        </section>
      </div>
    </div>
  );
};

const DeathBar = ({ label, count, color }: { label: string; count: number; color: string }) => {
  if (count === 0) return null;
  return (
    <div className="death-bar">
      <span className="death-label">{label}</span>
      <div className="death-bar-track">
        <div className="death-bar-fill" style={{ backgroundColor: color, width: '100%' }} />
      </div>
      <span className="death-count">{count.toLocaleString()}</span>
    </div>
  );
};
