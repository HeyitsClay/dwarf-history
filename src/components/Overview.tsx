import { useEffect, useState } from 'react';
import { db } from '../db/database';
import type { HistoricalFigure, WorldMetadata } from '../types';

interface OverviewProps {
  onViewFigures: () => void;
  onViewFigure: (id: number) => void;
  onNewWorld: () => void;
}

export const Overview = ({ onViewFigures, onViewFigure, onNewWorld }: OverviewProps) => {
  const [metadata, setMetadata] = useState<WorldMetadata | null>(null);
  const [topKillers, setTopKillers] = useState<HistoricalFigure[]>([]);
  const [recentDeaths, setRecentDeaths] = useState<HistoricalFigure[]>([]);
  const [raceStats, setRaceStats] = useState<{ race: string; count: number }[]>([]);
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

      // Get recent deaths (figures who died in the last 50 years of world history)
      const maxYear = Math.max(...allFigures.map(f => f.deathYear).filter(y => y > 0), 0);
      const recent = allFigures
        .filter(f => f.deathYear > 0 && f.deathYear >= maxYear - 50)
        .sort((a, b) => b.deathYear - a.deathYear)
        .slice(0, 10);
      setRecentDeaths(recent);

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
                  <span className="rank">#{idx + 1}</span>
                  <span className="name">{figure.name}</span>
                  <span className="race">{figure.race}</span>
                  <span className="kills">{figure.kills?.length || 0} kills</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No recorded kills in this world.</p>
          )}
        </section>

        <section className="overview-section">
          <h2>💀 Recent Deaths</h2>
          {recentDeaths.length > 0 ? (
            <ul className="death-list">
              {recentDeaths.map(figure => (
                <li key={figure.id} className="death-item" onClick={() => onViewFigure(figure.id)}>
                  <span className="year">Year {figure.deathYear}</span>
                  <span className="name">{figure.name}</span>
                  <span className="race">{figure.race}</span>
                  {figure.killer && (
                    <span className="killer">by {figure.killer.name}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No recent deaths recorded.</p>
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
