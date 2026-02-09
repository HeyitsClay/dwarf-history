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
  attacker: string;
  defender: string;
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
  const [topCivs, setTopCivs] = useState<{ entity: Entity; memberCount: number; siteCount: number; power: number }[]>([]);
  const [raceStats, setRaceStats] = useState<{ race: string; count: number; living: number }[]>([]);
  const [deathBreakdown, setDeathBreakdown] = useState<DeathBreakdown>({ combat: 0, oldAge: 0, violence: 0, accidents: 0, other: 0 });
  const [wars, setWars] = useState<WarData[]>([]);
  const [tripleThreat, setTripleThreat] = useState<{
    bloodiest: HistoricalFigure | null;
    strongest: Entity | null;
    hottestWar: WarData | null;
  }>({ bloodiest: null, strongest: null, hottestWar: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const meta = await db.getMetadata();
      setMetadata(meta || null);

      // Get all data
      const [allFigures, allEvents, allEntities, allSites] = await Promise.all([
        db.figures.toArray(),
        db.events.toArray(),
        db.entities.toArray(),
        db.sites.toArray(),
      ]);

      // World age - max year from events
      const maxYear = Math.max(...allEvents.map(e => e.year).filter(y => y > 0), 1);
      setCurrentYear(maxYear);

      // Living population (deathYear == -1 or 0)
      const living = allFigures.filter(f => f.deathYear <= 0);
      setLivingCount(living.length);

      // Activity level - events in last 50 years
      const recentEvents = allEvents.filter(e => e.year >= maxYear - 50);
      const recentDeathEvents = recentEvents.filter(e => e.type === 'hf died').length;
      if (recentDeathEvents > 1000) setActivityLevel('apocalypse');
      else if (recentDeathEvents > 500) setActivityLevel('chaotic');
      else if (recentDeathEvents > 100) setActivityLevel('active');
      else setActivityLevel('peaceful');

      // Calculate weighted kill scores
      const figuresWithScores = allFigures.map(f => ({
        ...f,
        weightedKills: calculateWeightedKills(f, allFigures),
      }));

      // Top killers by weighted score
      const sortedKillers = figuresWithScores
        .filter(f => f.weightedKills > 0)
        .sort((a, b) => b.weightedKills - a.weightedKills)
        .slice(0, 10);
      setTopKillers(sortedKillers);

      // Bloodiest living figure (triple threat)
      const bloodiestLiving = figuresWithScores
        .filter(f => f.deathYear <= 0 && f.kills && f.kills.length > 0)
        .sort((a, b) => (b.kills?.length || 0) - (a.kills?.length || 0))[0] || null;

      // Calculate civilization power
      const civPower = allEntities
        .filter(e => e.name)
        .map(entity => {
          const members = allFigures.filter(f => 
            f.entityLinks?.some(l => l.entityId === entity.id && (l.linkType === 'member' || l.linkType === 'ruler'))
          ).length;
          const sites = allSites.filter(s => {
            // Check if any event links this site to the entity as civ_id
            return allEvents.some(ev => ev.civId === entity.id && ev.siteId === s.id);
          }).length;
          const power = Math.round((members * 10 + sites * 50) / 100);
          return { entity, memberCount: members, siteCount: sites, power };
        })
        .filter(c => c.memberCount > 0)
        .sort((a, b) => b.power - a.power)
        .slice(0, 10);
      setTopCivs(civPower);

      // Strongest civ (triple threat)
      const strongest = civPower[0]?.entity || null;

      // War analysis
      const warEvents = allEvents.filter(e => 
        e.type === 'war declared' || e.type === 'battle' || e.type === 'hf died'
      );
      
      // Group events by war/pair of civs
      const warMap = new Map<string, WarData>();
      warEvents.forEach(e => {
        if (e.civId && e.siteId) {
          const key = `${Math.min(e.civId, e.siteId)}-${Math.max(e.civId, e.siteId)}`;
          if (!warMap.has(key)) {
            const civ1 = allEntities.find(ent => ent.id === e.civId);
            const civ2 = allEntities.find(ent => ent.id === e.siteId);
            warMap.set(key, {
              name: `${civ1?.name || 'Unknown'} vs ${civ2?.name || 'Unknown'}`,
              attacker: civ1?.name || 'Unknown',
              defender: civ2?.name || 'Unknown',
              deaths: 0,
              startYear: e.year,
            });
          }
          if (e.type === 'hf died') {
            warMap.get(key)!.deaths++;
          }
        }
      });
      
      const sortedWars = Array.from(warMap.values())
        .filter(w => w.deaths > 0)
        .sort((a, b) => b.deaths - a.deaths)
        .slice(0, 5);
      setWars(sortedWars);

      // Hottest war (triple threat)
      const hottestWar = sortedWars[0] || null;

      setTripleThreat({ bloodiest: bloodiestLiving, strongest, hottestWar });

      // Race statistics with living count
      const raceMap = new Map<string, { count: number; living: number }>();
      allFigures.forEach(f => {
        const current = raceMap.get(f.race) || { count: 0, living: 0 };
        current.count++;
        if (f.deathYear <= 0) current.living++;
        raceMap.set(f.race, current);
      });
      const sortedRaces = Array.from(raceMap.entries())
        .map(([race, data]) => ({ race, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      setRaceStats(sortedRaces);

      // Death breakdown
      const breakdown: DeathBreakdown = { combat: 0, oldAge: 0, violence: 0, accidents: 0, other: 0 };
      allEvents.filter(e => e.type === 'hf died').forEach(e => {
        const cause = (e.cause || '').toLowerCase();
        if (cause.includes('struck') || cause.includes('shot') || cause.includes('combat')) {
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

      setLoading(false);
    };

    loadData();
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

  if (loading) {
    return (
      <div className="overview-loading">
        <p>Loading world data...</p>
      </div>
    );
  }

  return (
    <div className="overview">
      {/* Header / World Vitals */}
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
                    <div className="civ-stats">{civ.memberCount} members • {civ.siteCount} sites</div>
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

// Helper to calculate weighted kill score
function calculateWeightedKills(figure: HistoricalFigure, allFigures: HistoricalFigure[]): number {
  if (!figure.kills) return 0;
  
  return figure.kills.reduce((score, kill) => {
    const victim = allFigures.find(f => f.id === kill.victimId);
    if (!victim) return score + 0.1;
    
    // Weight by victim type
    if (victim.race.includes('DEITY') || victim.race.includes('DEMON')) return score + 1000;
    if (victim.race.includes('TITAN') || victim.race.includes('FORGOTTEN_BEAST') || victim.race.includes('COLOSSUS') || victim.race.includes('DRAGON')) return score + 50;
    if (victim.race.includes('DWARF') || victim.race.includes('HUMAN') || victim.race.includes('ELF')) return score + 1;
    return score + 0.1; // Animals, etc.
  }, 0);
}

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
