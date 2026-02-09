import { useEffect, useState, useMemo } from 'react';
import { db } from '../db/database';
import type { HistoricalFigure, WorldMetadata, Entity } from '../types';

interface OverviewProps {
  onViewFigures: () => void;
  onViewFigure: (id: number) => void;
  onNewWorld: () => void;
}

export const Overview = ({ onNewWorld }: OverviewProps) => {
  const [, setMetadata] = useState<WorldMetadata | null>(null);
  const [currentYear, setCurrentYear] = useState(0);
  const [livingCount, setLivingCount] = useState(0);
  const [totalDeaths, setTotalDeaths] = useState(0);
  const [topKiller, setTopKiller] = useState<HistoricalFigure | null>(null);
  const [strongestCiv, setStrongestCiv] = useState<Entity | null>(null);
  const [raceStats, setRaceStats] = useState<{ race: string; count: number; living: number; category: 'civilized' | 'monster' | 'animal' | 'other' }[]>([]);
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
        const dead = allFigures.filter(f => f.deathYear > 0);
        setLivingCount(living.length);
        setTotalDeaths(dead.length);

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

        const raceMap = new Map<string, { count: number; living: number; category: 'civilized' | 'monster' | 'animal' | 'other' }>();
        
        allFigures.forEach(f => {
          const current = raceMap.get(f.race) || { count: 0, living: 0, category: getCategory(f.race) };
          current.count++;
          if (f.deathYear <= 0) current.living++;
          raceMap.set(f.race, current);
        });
        
        // Priority order for civilized races
        const priorityOrder = ['DWARF', 'HUMAN', 'ELF', 'GOBLIN'];
        const allRaces = Array.from(raceMap.entries()).map(([race, data]) => ({ race, ...data }));
        
        // Separate civilized, monsters, animals, other
        const civilized = allRaces
          .filter(r => r.category === 'civilized')
          .sort((a, b) => priorityOrder.indexOf(a.race) - priorityOrder.indexOf(b.race));
        
        const monsters = allRaces
          .filter(r => r.category === 'monster')
          .sort((a, b) => b.living - a.living);
        
        const animals = allRaces
          .filter(r => r.category === 'animal')
          .sort((a, b) => b.living - a.living)
          .slice(0, 3); // Top 3 animals
        
        const others = allRaces
          .filter(r => r.category === 'other')
          .sort((a, b) => b.living - a.living)
          .slice(0, 2); // Top 2 others
        
        setRaceStats([...civilized, ...monsters.slice(0, 3), ...animals, ...others]);
        setLoadingProgress(100);

      } catch (err) {
        console.error('Overview error:', err);
        setLoadingStage('Error loading data');
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

  const civilizedRaces = racePercentages.filter(r => r.category === 'civilized');
  const monsterRaces = racePercentages.filter(r => r.category === 'monster');
  const animalRaces = racePercentages.filter(r => r.category === 'animal');
  // const otherRaces = racePercentages.filter(r => r.category === 'other');

  if (loadingProgress < 100) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-logo">⚒️</div>
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
      {/* World Year */}
      <section className="year-section">
        <div className="year-display">
          <span className="year-label">Year</span>
          <span className="year-value">{currentYear.toLocaleString()}</span>
        </div>
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
          <div className="legend-block">
            <div className="legend-header">
              <span className="legend-icon">🗡️</span>
              <span className="legend-title">Deadliest Figure</span>
            </div>
            <div className="legend-content">
              <div className="legend-name">{topKiller.name}</div>
              <div className="legend-meta">{topKiller.race} • {topKiller.kills?.length || 0} kills</div>
            </div>
          </div>
        )}
        
        {strongestCiv && (
          <div className="legend-block">
            <div className="legend-header">
              <span className="legend-icon">🏛️</span>
              <span className="legend-title">Dominant Civilization</span>
            </div>
            <div className="legend-content">
              <div className="legend-name">{strongestCiv.name}</div>
              <div className="legend-meta">{strongestCiv.race || 'Mixed population'}</div>
            </div>
          </div>
        )}
      </section>

      {/* Population - Civilized */}
      {civilizedRaces.length > 0 && (
        <section className="population-section">
          <h3 className="section-header">Civilized Races</h3>
          <div className="population-bars">
            {civilizedRaces.map(({ race, living, percentage }) => (
              <div key={race} className="pop-bar civilized">
                <div className="pop-label">
                  <span className="pop-name">{race}</span>
                  <span className="pop-count">{living.toLocaleString()}</span>
                </div>
                <div className="pop-track">
                  <div 
                    className="pop-fill"
                    style={{ 
                      width: `${Math.max(percentage, 1)}%`,
                      backgroundColor: race === 'DWARF' ? '#d4a373' : race === 'HUMAN' ? '#2a9d8f' : race === 'ELF' ? '#e9c46a' : '#e76f51'
                    }}
                  />
                </div>
                <span className="pop-percent">{percentage.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Population - Monsters */}
      {monsterRaces.length > 0 && (
        <section className="population-section">
          <h3 className="section-header">Monsters</h3>
          <div className="population-bars">
            {monsterRaces.map(({ race, living, percentage }) => (
              <div key={race} className="pop-bar monster">
                <div className="pop-label">
                  <span className="pop-name">{race}</span>
                  <span className="pop-count">{living.toLocaleString()}</span>
                </div>
                <div className="pop-track">
                  <div 
                    className="pop-fill"
                    style={{ width: `${Math.max(percentage, 0.5)}%`, backgroundColor: '#9b2226' }}
                  />
                </div>
                <span className="pop-percent">{percentage.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Population - Wildlife */}
      {animalRaces.length > 0 && (
        <section className="population-section">
          <h3 className="section-header">Wildlife</h3>
          <div className="population-bars">
            {animalRaces.map(({ race, living, percentage }) => (
              <div key={race} className="pop-bar animal">
                <div className="pop-label">
                  <span className="pop-name">{race}</span>
                  <span className="pop-count">{living.toLocaleString()}</span>
                </div>
                <div className="pop-track">
                  <div 
                    className="pop-fill"
                    style={{ width: `${Math.max(percentage, 0.5)}%`, backgroundColor: '#6b6b6b' }}
                  />
                </div>
                <span className="pop-percent">{percentage.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action */}
      <section className="action-section">
        <button className="btn-new-world" onClick={onNewWorld}>
          Load Different World
        </button>
      </section>
    </div>
  );
};
