import { useEffect, useState } from 'react';
import { db } from '../db/database';
import type { HistoricalFigure, WorldMetadata, Entity } from '../types';

interface OverviewProps {
  onViewFigures: () => void;
  onViewFigure: (id: number) => void;
  onNewWorld: () => void;
}

export const Overview = ({ onViewFigures, onViewFigure, onNewWorld }: OverviewProps) => {
  const [metadata, setMetadata] = useState<WorldMetadata | null>(null);
  const [topKillers, setTopKillers] = useState<HistoricalFigure[]>([]);
  const [raceStats, setRaceStats] = useState<{ race: string; count: number }[]>([]);
  const [topCivs, setTopCivs] = useState<{ entity: Entity; memberCount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const meta = await db.getMetadata();
      setMetadata(meta || null);

      // Get top 10 killers
      const allFigures = await db.figures.toArray();
      const sortedByKills = allFigures
        .filter(f => (f.kills?.length || 0) > 0)
        .sort((a, b) => (b.kills?.length || 0) - (a.kills?.length || 0))
        .slice(0, 10);
      setTopKillers(sortedByKills);

      // Race statistics
      const raceCounts = new Map<string, number>();
      allFigures.forEach(f => {
        raceCounts.set(f.race, (raceCounts.get(f.race) || 0) + 1);
      });
      const sortedRaces = Array.from(raceCounts.entries())
        .map(([race, count]) => ({ race, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      setRaceStats(sortedRaces);

      // Top civilizations by member count
      const allEntities = await db.entities.toArray();
      const civMemberCounts = new Map<number, number>();
      
      // Count members for each entity
      allFigures.forEach(f => {
        f.entityLinks?.forEach(link => {
          if (link.linkType === 'member' || link.linkType === 'ruler') {
            civMemberCounts.set(link.entityId, (civMemberCounts.get(link.entityId) || 0) + 1);
          }
        });
      });

      // Sort by member count and get top 10
      const sortedCivs = Array.from(civMemberCounts.entries())
        .map(([entityId, count]) => ({ 
          entity: allEntities.find(e => e.id === entityId) || { id: entityId, name: `Entity #${entityId}` },
          memberCount: count 
        }))
        .filter(c => c.entity.name) // Only include named entities
        .sort((a, b) => b.memberCount - a.memberCount)
        .slice(0, 10);
      setTopCivs(sortedCivs);

      setLoading(false);
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="overview-loading">
        <p>Loading world data...</p>
      </div>
    );
  }

  return (
    <div className="overview">
      <div className="overview-header">
        <h1>{metadata?.name || 'Unknown World'}</h1>
        <div className="world-stats-grid">
          <StatCard label="Historical Figures" value={metadata?.figureCount || 0} />
          <StatCard label="Historical Events" value={metadata?.eventCount || 0} />
          <StatCard label="Sites" value={metadata?.siteCount || 0} />
          <StatCard label="Entities" value={metadata?.entityCount || 0} />
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

      <div className="overview-sections">
        <section className="overview-section">
          <h2>⚔️ Top Killers</h2>
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

        <section className="overview-section">
          <h2>🏛️ Top Civilizations</h2>
          {topCivs.length > 0 ? (
            <ul className="civ-list">
              {topCivs.map((civ, idx) => (
                <li key={civ.entity.id} className="civ-item">
                  <div className="civ-rank">#{idx + 1}</div>
                  <div className="civ-info">
                    <div className="civ-name">{civ.entity.name}</div>
                    {civ.entity.race && <div className="civ-race">{civ.entity.race}</div>}
                  </div>
                  <div className="civ-count">{civ.memberCount} members</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No civilization data available.</p>
          )}
        </section>

        <section className="overview-section">
          <h2>📊 Races</h2>
          {raceStats.length > 0 ? (
            <ul className="race-list">
              {raceStats.map(({ race, count }) => (
                <li key={race} className="race-item">
                  <span className="race-name">{race}</span>
                  <span className="race-count">{count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No race data available.</p>
          )}
        </section>
      </div>
    </div>
  );
};

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="stat-card">
    <span className="stat-value">{value.toLocaleString()}</span>
    <span className="stat-label">{label}</span>
  </div>
);
