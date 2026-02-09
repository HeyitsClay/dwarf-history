import { useEffect, useState, useMemo } from 'react';
import { db } from '../db/database';
import type { HistoricalFigure, WorldMetadata, Entity } from '../types';

interface OverviewProps {
  onViewFigures: () => void;
  onViewFigure: (id: number) => void;
  onNewWorld: () => void;
}

export const Overview = ({ onNewWorld }: OverviewProps) => {
  const [metadata, setMetadata] = useState<WorldMetadata | null>(null);
  const [currentYear, setCurrentYear] = useState(0);
  const [livingCount, setLivingCount] = useState(0);
  const [totalDeaths, setTotalDeaths] = useState(0);
  const [activityLevel, setActivityLevel] = useState<'peaceful' | 'active' | 'chaotic' | 'apocalypse'>('peaceful');
  const [topKiller, setTopKiller] = useState<HistoricalFigure | null>(null);
  const [strongestCiv, setStrongestCiv] = useState<Entity | null>(null);
  const [raceStats, setRaceStats] = useState<{ race: string; count: number; living: number }[]>([]);
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
        setMetadata(meta || null);

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

        const maxYear = Math.max(...allFigures.map(f => f.deathYear > 0 ? f.deathYear : 0), 1);
        setCurrentYear(maxYear);
        
        const living = allFigures.filter(f => f.deathYear <= 0);
        setLivingCount(living.length);
        
        const dead = allFigures.filter(f => f.deathYear > 0);
        setTotalDeaths(dead.length);

        const recentDeaths = allFigures.filter(f => f.deathYear > maxYear - 50).length;
        if (recentDeaths > 1000) setActivityLevel('apocalypse');
        else if (recentDeaths > 500) setActivityLevel('chaotic');
        else if (recentDeaths > 100) setActivityLevel('active');
        else setActivityLevel('peaceful');

        setLoadingStage('Finding legends...');
        setLoadingProgress(85);
        await new Promise(r => setTimeout(r, 0));
        
        const sortedKillers = allFigures
          .filter(f => (f.kills?.length || 0) > 0)
          .sort((a, b) => (b.kills?.length || 0) - (a.kills?.length || 0));
        setTopKiller(sortedKillers[0] || null);

        const allEntities = await db.entities.toArray();
        const civs = allEntities
          .filter(e => e.name)
          .map(entity => ({
            entity,
            members: allFigures.filter(f => 
              f.entityLinks?.some(l => l.entityId === entity.id)
            ).length
          }))
          .filter(c => c.members > 0)
          .sort((a, b) => b.members - a.members);
        setStrongestCiv(civs[0]?.entity || null);

        const raceMap = new Map<string, { count: number; living: number }>();
        allFigures.forEach(f => {
          const current = raceMap.get(f.race) || { count: 0, living: 0 };
          current.count++;
          if (f.deathYear <= 0) current.living++;
          raceMap.set(f.race, current);
        });
        
        const priorityRaces = ['DWARF', 'HUMAN', 'ELF'];
        const allRaces = Array.from(raceMap.entries()).map(([race, data]) => ({ race, ...data }));
        const prioritized = allRaces.filter(r => priorityRaces.includes(r.race))
          .sort((a, b) => priorityRaces.indexOf(a.race) - priorityRaces.indexOf(b.race));
        const others = allRaces.filter(r => !priorityRaces.includes(r.race))
          .sort((a, b) => b.count - a.count);
        
        setRaceStats([...prioritized, ...others].slice(0, 6));
        setLoadingProgress(100);

      } catch (err) {
        console.error('Overview error:', err);
        setLoadingStage('Error loading data');
      }
    };

    loadData();
    return () => { isCancelled = true; };
  }, []);

  const activityColor = useMemo(() => ({
    peaceful: '#2a9d8f',
    active: '#e9c46a',
    chaotic: '#e76f51',
    apocalypse: '#9b2226',
  })[activityLevel], [activityLevel]);

  const activityText = useMemo(() => ({
    peaceful: 'Age of Peace',
    active: 'Age of Conflict',
    chaotic: 'Age of Chaos',
    apocalypse: 'Age of Doom',
  })[activityLevel], [activityLevel]);

  const activityEmoji = useMemo(() => ({
    peaceful: '☮️',
    active: '⚔️',
    chaotic: '🔥',
    apocalypse: '☠️',
  })[activityLevel], [activityLevel]);

  if (loadingProgress < 100) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <h1 className="loading-title">⚒️ Dwarf History</h1>
          <p className="loading-stage">{loadingStage}</p>
          <div className="loading-bar">
            <div className="loading-fill" style={{ width: `${loadingProgress}%` }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overview-dashboard">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="world-title">
          <h1>{metadata?.name || 'Unknown World'}</h1>
          <div className="age-badge">
            <span className="age-label">Year</span>
            <span className="age-value">{currentYear}</span>
          </div>
        </div>
        
        <div className="status-pill" style={{ borderColor: activityColor }}>
          <span className="status-emoji">{activityEmoji}</span>
          <span className="status-text" style={{ color: activityColor }}>{activityText}</span>
        </div>
      </section>

      {/* Big Stats */}
      <section className="big-stats">
        <div className="stat-box living">
          <div className="stat-icon">👥</div>
          <div className="stat-number">{livingCount.toLocaleString()}</div>
          <div className="stat-label">Living Souls</div>
        </div>
        
        <div className="stat-box dead">
          <div className="stat-icon">💀</div>
          <div className="stat-number">{totalDeaths.toLocaleString()}</div>
          <div className="stat-label">Fallen</div>
        </div>
        
        <div className="stat-box total">
          <div className="stat-icon">📜</div>
          <div className="stat-number">{(livingCount + totalDeaths).toLocaleString()}</div>
          <div className="stat-label">Total Figures</div>
        </div>
      </section>

      {/* Legends Section */}
      <section className="legends-section">
        <h2 className="section-title">Legends of This Age</h2>
        
        <div className="legends-grid">
          {topKiller && (
            <div className="legend-card killer">
              <div className="legend-icon">🩸</div>
              <div className="legend-label">Deadliest Figure</div>
              <div className="legend-name">{topKiller.name}</div>
              <div className="legend-detail">{topKiller.race} • {topKiller.kills?.length || 0} kills</div>
            </div>
          )}
          
          {strongestCiv && (
            <div className="legend-card civ">
              <div className="legend-icon">👑</div>
              <div className="legend-label">Dominant Civilization</div>
              <div className="legend-name">{strongestCiv.name}</div>
              <div className="legend-detail">{strongestCiv.race || 'Mixed'}</div>
            </div>
          )}
        </div>
      </section>

      {/* Population Section */}
      <section className="population-section">
        <h2 className="section-title">Population by Race</h2>
        <div className="race-bars">
          {raceStats.map(({ race, count, living }) => (
            <div key={race} className="race-bar">
              <div className="race-header">
                <span className="race-name">{race}</span>
                <span className="race-numbers">{living.toLocaleString()} / {count.toLocaleString()}</span>
              </div>
              <div className="race-track">
                <div 
                  className="race-fill" 
                  style={{ 
                    width: `${(count / (livingCount + totalDeaths)) * 100}%`,
                    backgroundColor: race === 'DWARF' ? '#d4a373' : race === 'HUMAN' ? '#2a9d8f' : race === 'ELF' ? '#e9c46a' : '#808080'
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Action Section */}
      <section className="action-section">
        <button className="btn-new-world" onClick={onNewWorld}>
          🌍 Load Different World
        </button>
      </section>
    </div>
  );
};
