import { useEffect, useState, useMemo } from 'react';
import { db } from '../db/database';
import type { HistoricalFigure, Entity } from '../types';

interface OverviewProps {
  onViewFigures: () => void;
  onViewFigure: (id: number) => void;
  onNewWorld: () => void;
}

// Get the legendary title for the best master of each category
const getCategoryBestTitle = (category: string): string => {
  const titles: Record<string, string> = {
    'Combat': 'Grand Master',
    'Weaponry': 'Arms Master',
    'Siegecraft': 'Siege Engineer',
    'Smithing': 'Master Smith',
    'Stoneworking': 'Stone Mason',
    'Woodworking': 'Woodwright',
    'Textile Arts': 'Textile Master',
    'Crafting': 'Artisan',
    'Engineering': 'Engineer',
    'Medicine': 'Physician',
    'Agriculture': 'Horticulturist',
    'Foodcraft': 'Chef',
    'Animal Handling': 'Beast Master',
    'Command': 'Commander',
    'Social Arts': 'Diplomat',
    'Scholarship': 'Scholar',
    'Performance': 'Performer',
    'Athletics': 'Athlete',
    'Survival': 'Survivalist',
    'Industry': 'Industrialist'
  };
  return titles[category] || 'Master';
};

// School groupings for Guild Hall
const SCHOOLS = [
  {
    id: 'martial',
    name: 'Martial Academy',
    icon: '⚔️',
    color: '#e76f51',
    categories: ['Combat', 'Weaponry', 'Siegecraft', 'Command']
  },
  {
    id: 'crafts',
    name: 'Craftsman\'s Guild',
    icon: '🔨',
    color: '#d4a373',
    categories: ['Smithing', 'Stoneworking', 'Woodworking', 'Textile Arts', 'Crafting', 'Engineering']
  },
  {
    id: 'life',
    name: 'Life Circle',
    icon: '🌿',
    color: '#2a9d8f',
    categories: ['Medicine', 'Agriculture', 'Foodcraft', 'Animal Handling']
  },
  {
    id: 'mind',
    name: 'Mind Society',
    icon: '📚',
    color: '#9b5de5',
    categories: ['Social Arts', 'Scholarship', 'Performance']
  },
  {
    id: 'physical',
    name: 'Way of the Body',
    icon: '💪',
    color: '#f4a261',
    categories: ['Athletics', 'Survival', 'Industry']
  }
];

// Guild Hall Component
interface GuildHallProps {
  skillsData: { category: string; bestMaster: { name: string; totalIp: number } | null; skills: { skill: string; count: number; topFigures: { name: string; skillLevel: number }[] }[] }[];
}

// Artifacts Card Component - Simplified version showing just counts
const ArtifactsCard = () => {
  const [artifactStats, setArtifactStats] = useState<{
    total: number;
    created: number;
    heroic: number;
    holy: number;
    written: number;
    lost: number;
  } | null>(null);

  useEffect(() => {
    const loadArtifacts = async () => {
      try {
        const allArtifacts = await db.artifacts.toArray();
        
        // Log raw data for debugging
        console.log(`Loaded ${allArtifacts.length} artifacts`);
        if (allArtifacts.length > 0) {
          console.log('First artifact:', allArtifacts[0]);
        }
        
        // Simple categorization based on available data
        // Most artifacts in DF are "created" - they have a creator_hf_id
        const created = allArtifacts.filter(a => a.creatorHfid && a.creatorHfid !== -1).length;
        
        // Heroic = explicitly named after slaying OR name suggests it
        const heroic = allArtifacts.filter(a => {
          if (a.isNamedAfterSlaying) return true;
          const name = a.name?.toLowerCase() || '';
          return name.includes('slay') || name.includes('killer') || name.includes('bane');
        }).length;
        
        // Holy = explicitly marked as relic OR held by entity (temple/religion)
        const holy = allArtifacts.filter(a => {
          if (a.isRelic) return true;
          return a.entityId && a.entityId !== -1;
        }).length;
        
        // Written = books, scrolls, slabs, etc.
        const written = allArtifacts.filter(a => {
          if (a.isWrittenContent) return true;
          const type = `${a.itemType || ''} ${a.itemSubtype || ''}`.toLowerCase();
          return type.includes('book') || type.includes('scroll') || type.includes('slab') || 
                 type.includes('codex') || type.includes('page');
        }).length;
        
        // Lost = no current location
        const lost = allArtifacts.filter(a => 
          (!a.holderHfid || a.holderHfid === -1) && 
          (!a.siteId || a.siteId === -1) &&
          (!a.entityId || a.entityId === -1)
        ).length;
        
        setArtifactStats({
          total: allArtifacts.length,
          created,
          heroic,
          holy,
          written,
          lost
        });
        
        console.log('Artifact counts:', { total: allArtifacts.length, created, heroic, holy, written, lost });
      } catch (err) {
        console.error('Error loading artifacts:', err);
      }
    };
    
    loadArtifacts();
  }, []);

  if (!artifactStats || artifactStats.total === 0) {
    return null;
  }

  return (
    <section className="artifacts-section">
      <div className="artifacts-header">
        <h2 className="artifacts-title">🏺 Artifacts</h2>
        <p className="artifacts-subtitle">{artifactStats.total.toLocaleString()} Legendary Items</p>
      </div>
      
      <div className="artifact-categories-simple">
        <div className="artifact-stat-card">
          <span className="artifact-stat-icon">🎨</span>
          <span className="artifact-stat-value">{artifactStats.created}</span>
          <span className="artifact-stat-label">Created</span>
        </div>
        
        <div className="artifact-stat-card">
          <span className="artifact-stat-icon">⚔️</span>
          <span className="artifact-stat-value">{artifactStats.heroic}</span>
          <span className="artifact-stat-label">Heroic Relics</span>
        </div>
        
        <div className="artifact-stat-card">
          <span className="artifact-stat-icon">✨</span>
          <span className="artifact-stat-value">{artifactStats.holy}</span>
          <span className="artifact-stat-label">Holy Artifacts</span>
        </div>
        
        <div className="artifact-stat-card">
          <span className="artifact-stat-icon">📜</span>
          <span className="artifact-stat-value">{artifactStats.written}</span>
          <span className="artifact-stat-label">Written Works</span>
        </div>
        
        <div className="artifact-stat-card">
          <span className="artifact-stat-icon">❓</span>
          <span className="artifact-stat-value">{artifactStats.lost}</span>
          <span className="artifact-stat-label">Lost Treasures</span>
        </div>
      </div>
    </section>
  );
};

const GuildHall = ({ skillsData }: GuildHallProps) => {
  const [activeSchool, setActiveSchool] = useState('martial');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const activeSchoolData = SCHOOLS.find(s => s.id === activeSchool);
  const schoolCategories = skillsData.filter(d => activeSchoolData?.categories.includes(d.category));

  return (
    <section className="guild-hall">
      <div className="guild-header">
        <h2 className="guild-title">🏛️ Guild Hall</h2>
        <p className="guild-subtitle">Five Schools of Mastery</p>
      </div>

      {/* School Tabs */}
      <div className="school-tabs">
        {SCHOOLS.map(school => (
          <button
            key={school.id}
            className={`school-tab ${activeSchool === school.id ? 'active' : ''}`}
            onClick={() => { setActiveSchool(school.id); setExpandedCategory(null); }}
            style={{ '--school-color': school.color } as React.CSSProperties}
          >
            <span className="school-icon">{school.icon}</span>
            <span className="school-name">{school.name}</span>
          </button>
        ))}
      </div>

      {/* School Content */}
      <div className="school-content" style={{ '--school-color': activeSchoolData?.color } as React.CSSProperties}>
        <div className="category-cards">
          {schoolCategories.map(categoryData => {
            const totalPractitioners = categoryData.skills.reduce((sum, s) => sum + s.count, 0);
            const isExpanded = expandedCategory === categoryData.category;

            return (
              <div
                key={categoryData.category}
                className={`category-card ${isExpanded ? 'expanded' : ''}`}
                onClick={() => setExpandedCategory(isExpanded ? null : categoryData.category)}
              >
                <div className="card-header">
                  <h3 className="card-title">{categoryData.category}</h3>
                  <span className="card-count">{totalPractitioners.toLocaleString()} practitioners</span>
                </div>

                {categoryData.bestMaster && (
                  <div className="card-champion">
                    <div className="champion-crown">👑</div>
                    <div className="champion-info">
                      <span className="champion-title">{getCategoryBestTitle(categoryData.category)}</span>
                      <span className="champion-name">{categoryData.bestMaster.name}</span>
                    </div>
                    <div className="champion-level">
                      Lv.{Math.floor(categoryData.bestMaster.totalIp / 100)}
                    </div>
                  </div>
                )}

                {isExpanded && (
                  <div className="card-skills">
                    {categoryData.skills.slice(0, 5).map((skill, idx) => (
                      <div key={idx} className="skill-row">
                        <span className="skill-name">{skill.skill.replace(/_/g, ' ').toLowerCase()}</span>
                        <span className="skill-practitioners">{skill.count}</span>
                      </div>
                    ))}
                    {categoryData.skills.length > 5 && (
                      <div className="skill-more">+{categoryData.skills.length - 5} more skills</div>
                    )}
                  </div>
                )}

                {!isExpanded && <div className="card-hint">Click to expand</div>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export const Overview = ({ onNewWorld }: OverviewProps) => {
  const [year, setYear] = useState<number>(0);
  const [livingCount, setLivingCount] = useState(0);
  const [totalDeaths, setTotalDeaths] = useState(0);
  const [topKiller, setTopKiller] = useState<HistoricalFigure | null>(null);
  const [strongestCiv, setStrongestCiv] = useState<{ entity: Entity; members: number; living: number; kills: number; artifacts: number; power: number } | null>(null);
  const [raceStats, setRaceStats] = useState<{ race: string; count: number; living: number; kills: number; deaths: number; category: 'civilized' | 'monster' | 'animal' | 'other' }[]>([]);
  const [artifactHolders, setArtifactHolders] = useState<{ entity: Entity; count: number; percentage: number }[]>([]);
  const [topDeities, setTopDeities] = useState<{ name: string; worshippers: number }[]>([]);
  const [siteTypes, setSiteTypes] = useState<{ type: string; count: number; percentage: number }[]>([]);
  const [skillsData, setSkillsData] = useState<{ category: string; bestMaster: { name: string; totalIp: number } | null; skills: { skill: string; count: number; topFigures: { name: string; skillLevel: number }[] }[] }[]>([]);
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

        // Site types aggregation
        const allSites = await db.sites.toArray();
        const siteTypeMap = new Map<string, number>();
        allSites.forEach(s => {
          const type = s.type || 'Unknown';
          siteTypeMap.set(type, (siteTypeMap.get(type) || 0) + 1);
        });
        const totalSites = allSites.length;
        const siteTypeList = Array.from(siteTypeMap.entries())
          .map(([type, count]) => ({ type, count, percentage: totalSites > 0 ? (count / totalSites) * 100 : 0 }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 6);
        setSiteTypes(siteTypeList);

        // Skills aggregation - ALL skills grouped by category
        const figuresWithSkills = allFigures.filter(f => f.hfSkills && f.hfSkills.length > 0);
        
        // Skill category mapping - User-specified All-Star categories
        const getSkillCategory = (skill: string): string => {
          const s = skill.toUpperCase();
          
          // COMBAT - Armor, defense, wrestling, striking
          if (['DODGE', 'DODGING', 'ARMOR', 'ARMOR_USER', 'SHIELD', 'SHIELD_USER', 'WRESTLE', 'WRESTLING', 'GRASP', 'GRASP_STRIKE', 'STANCE', 'STANCE_STRIKE', 'BITE', 'MELEE', 'MELEE_COMBAT', 'RANGED', 'RANGED_COMBAT'].includes(s)) return 'Combat';
          
          // WEAPONRY - All weapon types
          if (['CROSSBOW', 'CROSSBOWMAN', 'SPEAR', 'SPEARMAN', 'SPEARMANSHIP', 'SWORD', 'SWORDS', 'SWORDSMANSHIP', 'SWORDSMAN', 'MACE', 'MACEMAN', 'MACEMANSHIP', 'HAMMER', 'HAMMERMAN', 'HAMMERMANSHIP', 'AXE', 'AXEMAN', 'AXEMANSHIP', 'BOW', 'BOWMAN', 'DAGGER', 'KNIFE', 'WHIP', 'PIKE', 'PIKEMAN', 'PIKEMANSHIP', 'THROW', 'THROWING', 'MISC_WEAPON', 'MSC_WEAPON', 'WEAPON_MASTER', 'BLOWGUN', 'BLOW_GUN', 'BLOWGUNMAN', 'SCOURGE'].includes(s)) return 'Weaponry';
          
          // SIEGE CRAFT - Siege operation and crafting
          if (['SIEGEOPERATE', 'SIEGE_OPERATE', 'SIEGE_CRAFT', 'SIEGE_CRAFTING', 'SIEGE_WEAPON', 'SIEGE_ENGINE', 'SIEGE_BUILDING', 'BALLISTA', 'CATAPULT', 'BALLISTA_CRAFT', 'CATAPULT_CRAFT', 'SIEGE_ENGINEERING', 'SIEGE_ENGINEER'].includes(s)) return 'Siegecraft';
          
          // SMITHING - Metal forging and extraction
          if (['FORGE_WEAPON', 'FORGE_FURNITURE', 'METALCRAFT', 'FORGE_ARMOR', 'SMELT', 'SMELTING', 'EXTRACT_STRAND', 'STRAND_EXTRACT', 'WEAPONSMITH', 'WEAPONSMITHING', 'ARMORSMITH', 'ARMORSMITHING', 'BLACKSMITH', 'BLACKSMITHING', 'FORGE'].includes(s)) return 'Smithing';
          
          // STONEWORKING - Stone crafts, masonry, gems, mining
          if (['MASONRY', 'ENGRAVE_STONE', 'STONE_ENGRAVING', 'ENGRAVE', 'ENGRAVING', 'STONECRAFT', 'CUT_STONE', 'CARVE_STONE', 'CUTGEM', 'CUT_GEM', 'ENCRUSTGEM', 'ENCRUST_GEM', 'MINING', 'DETAILSTONE', 'DETAIL_STONE', 'STONE_CARVE', 'STONE_CARVING', 'ENCASEFORTIFICATION', 'ENCASE_FORTIFICATION', 'CONSOLEFORTIFICATION', 'CONSOLE_FORTIFICATION', 'STONE', 'ROCK_CRAFT', 'STONE_DRESSING', 'STONE_DETAILING'].includes(s)) return 'Stoneworking';
          
          // WOODWORKING - Wood crafts and bowyer
          if (['WOODCUTTING', 'WOOD_CUTTING', 'WOOD_BURNING', 'WOOD_BURN', 'WOODCRAFT', 'CARPENTRY', 'BOWYER', 'WOOD_CARVE', 'WOOD_CARVING', 'FORESTRY', 'LUMBER', 'LUMBERJACK', 'WOODSMAN', 'FURNITURE', 'WOODWORK', 'WOOD_SHAPING', 'TIMBER', 'LOG', 'TREE_FELLING'].includes(s)) return 'Woodworking';
          
          // TEXTILE ARTS - Cloth, leather, weaving, shearing
          if (['SPINNING', 'WEAVING', 'CLOTHESMAKING', 'LEATHERWORK', 'LEATHERWORKING', 'TANNER', 'TANNING', 'DYER', 'DYEING', 'SHEAR', 'SHEARER', 'SHEARING', 'CLOTH', 'TAILOR', 'SEWING', 'KNITTING', 'EMBROIDERY', 'LEATHER_CRAFT', 'CLOTH_CRAFT'].includes(s)) return 'Textile Arts';
          
          // CRAFTING - Bone, glass, pottery, wax
          if (['BONECARVE', 'BONE_CARVE', 'BONE_CARVING', 'GLASSMAKER', 'GLASSMAKING', 'POTTERY', 'GLAZING', 'WAX_WORKING', 'WAX', 'GLASS_CRAFT', 'PORCELAIN', 'CERAMICS', 'KILN', 'CLAY'].includes(s)) return 'Crafting';
          
          // ENGINEERING - Mechanics and pumps
          if (['MECHANICS', 'MECHANIC', 'OPERATE_PUMP', 'PUMP_OPERATION', 'PUMP', 'FLUID_ENGINEER', 'OPTICS_ENGINEER', 'GEAR_ASSEMBLY', 'AXLE', 'WATER_WHEEL', 'WINDMILL', 'SCREW_PUMP', 'PISTON', 'LEVER', 'PRESSURE_PLATE', 'LINK', 'MECHANISM'].includes(s)) return 'Engineering';
          
          // MEDICINE - Medical skills
          if (['DRESS_WOUNDS', 'DRESSING_WOUNDS', 'WOUND_DRESSING', 'SUTURE', 'SUTURING', 'DIAGNOSE', 'DIAGNOSIS', 'SURGERY', 'SURGEON', 'SET_BONE', 'SET_BONES', 'PHYSICIAN', 'DOCTOR', 'MEDIC', 'FIRST_AID', 'BANDAGE', 'SPLINT', 'CAST', 'MEDICAL_PRACTICE', 'HEALING', 'TREATMENT', 'CARE_GIVER', 'NURSE', 'NURSING'].includes(s)) return 'Medicine';
          
          // AGRICULTURE - Plants and processing
          if (['HERBALISM', 'PLANT', 'PLANTS', 'PROCESSPLANTS', 'PROCESS_PLANTS', 'MILLING', 'PRESSING', 'BREWING', 'CHEESEMAKING', 'BEEKEEPING', 'BEE_KEEPING', 'GROWING', 'FARMING', 'FARMING_FIELD', 'GARDENING', 'CULTIVATION', 'THRESHING', 'QUERN', 'MILLSTONE', 'PLANT_PROCESSING'].includes(s)) return 'Agriculture';
          
          // FOODCRAFT - Cooking, butchery, fishing, processing
          if (['COOK', 'COOKING', 'BUTCHER', 'BUTCHERING', 'GELD', 'GELDING', 'MILK', 'MILKING', 'FISH', 'FISHING', 'DISSECT_FISH', 'FISH_DISSECTION', 'CLEAN_FISH', 'FISH_CLEANING', 'PROCESSFISH', 'PROCESS_FISH', 'MEAL_PREPARATION', 'PREPARE_MEAL', 'KITCHEN', 'CHEF', 'BAKING', 'SLAUGHTER', 'MEAT_CRAFT', 'FAT_RENDERING', 'RENDER_FAT', 'TALLOW'].includes(s)) return 'Foodcraft';
          
          // ANIMAL HANDLING - Animals, training, riding, trapping (NO hunting/sneak/dissect)
          if (['ANIMALCARE', 'ANIMAL_CARE', 'ANIMALTRAIN', 'ANIMAL_TRAIN', 'TRAIN_ANIMALS', 'TAME', 'TAMING', 'TRAPPING', 'RIDING', 'RIDER', 'PET', 'WAR_TRAIN', 'HUNT_TRAIN', 'KENNEL', 'PASTURE', 'ZOO', 'WAR_ANIMAL', 'HUNTING_ANIMAL', 'GUARD_ANIMAL', 'ANIMAL', 'MOUNT', 'MOUNTED_COMBAT', 'CAVALRY', 'HORSE', 'CAMEL', 'ELEPHANT'].includes(s)) return 'Animal Handling';
          
          // COMMAND - Leadership, discipline, tactics, teaching, situational awareness
          if (['LEADERSHIP', 'DISCIPLINE', 'ORGANIZATION', 'MILITARY_TACTICS', 'TACTICS', 'TEACHING', 'TEACHER', 'SITUATIONAL_AWARENESS', 'STRATEGY', 'COMMAND', 'SQUAD_LEAD', 'COORDINATION', 'CHAIN_OF_COMMAND', 'RANK', 'OFFICER', 'GENERAL', 'CAPTAIN', 'LIEUTENANT', 'SERGEANT', 'CORPORAL', 'BOSS', 'CHIEF', 'HEAD', 'LEADER', 'DIRECTOR', 'SUPERVISOR', 'OVERSEER', 'MANAGER', 'INSTRUCTOR', 'PROFESSOR', 'MENTOR', 'APPRENTICE', 'LEARNING', 'EDUCATION', 'SCHOOL', 'ACADEMY', 'UNIVERSITY', 'LECTURE', 'DEMONSTRATION'].includes(s)) return 'Command';
          
          // SOCIAL ARTS - Social interaction (NO situational awareness)
          if (['JUDGING_INTENT', 'NEGOTIATION', 'COMEDY', 'COMEDIAN', 'PACIFY', 'PACIFICATION', 'INTIMIDATION', 'PERSUASION', 'CONSOLE', 'CONSOLATION', 'FLATTERY', 'SPEAKING', 'SPEAKER', 'LYING', 'DECEPTION', 'CONVERSATION', 'CHARM', 'CHARISMA', 'ETIQUETTE', 'MANNERS', 'SOCIAL', 'SOCIALIZE', 'DIPLOMACY', 'INTRIGUE'].includes(s)) return 'Social Arts';
          
          // SCHOLARSHIP - Writing, knowledge, science, appraisal, concentration
          if (['WRITING', 'WRITER', 'POETRY', 'POET', 'RECORD_KEEPING', 'PROSE', 'READING', 'READER', 'CRITICAL_THINKING', 'ASTRONOMY', 'LOGIC', 'GEOGRAPHY', 'PAPERMAKING', 'CHEMISTRY', 'BOOKBINDING', 'MATHEMATICS', 'KNOWLEDGE_ACQUISITION', 'KNOWLEDGE_GAIN', 'APPRAISAL', 'APPRAISE', 'CONCENTRATION', 'KNOWLEDGE', 'STUDENT', 'RESEARCHER', 'RESEARCH', 'SCHOLAR', 'SCIENCE', 'HISTORY', 'ARCHEOLOGY', 'GEOLOGY', 'METEOROLOGY', 'PHYSICS', 'ALCHEMY', 'LIBRARY', 'SCRIVAL_HALL', 'CLERK', 'SCRIBE', 'COPYIST', 'LITERACY', 'ADMINISTRATION', 'ACCOUNTING', 'LEDGER', 'BOOKKEEPING', 'REGISTRY', 'CENSUS', 'ARCHIVE', 'DOCUMENT', 'STORYTELLING', 'STORYTELLER', 'AUTHOR', 'NOVEL', 'EPIC', 'SAGA', 'LETTER', 'MANUSCRIPT', 'SCROLL', 'CODEX', 'INK', 'QUILL'].includes(s)) return 'Scholarship';
          
          // PERFORMANCE - Music, dance, singing, instruments
          if (['MAKE_MUSIC', 'MUSIC', 'MUSICIAN', 'DANCE', 'DANCING', 'DANCER', 'SING', 'SINGING', 'SINGER', 'PLAY_WIND_INSTRUMENT', 'PLAY_WIND', 'PLAY_STRINGED_INSTRUMENT', 'PLAY_STRING', 'PLAY_PERCUSSION_INSTRUMENT', 'PLAY_PERCUSSION', 'PLAY_KEYBOARD_INSTRUMENT', 'PLAY_KEYBOARD', 'INSTRUMENT', 'COMPOSITION', 'CONDUCTING', 'PERFORMANCE', 'LUTE', 'HARP', 'DRUM', 'FLUTE', 'TRUMPET', 'HARPSICHORD', 'PIANO', 'VIOLIN', 'GUITAR', 'CHOREOGRAPHY', 'BALLET', 'RITUAL_DANCE', 'SOCIAL_DANCE', 'FOLK_DANCE'].includes(s)) return 'Performance';
          
          // ATHLETICS - Physical skills (climbing, swimming only per spec)
          if (['CLIMBING', 'CLIMBER', 'SWIMMING', 'SWIMMER'].includes(s)) return 'Athletics';
          
          // SURVIVAL - Dissect vermin, sneak, tracking (NO foraging/camping)
          if (['DISSECT_VERMIN', 'VERMIN_DISSECTION', 'SNEAK', 'SNEAKING', 'TRACKING', 'TRACK', 'STALK', 'STALKING', 'AMBUSH', 'AMBUSHING'].includes(s)) return 'Survival';
          
          // INDUSTRY - Chemical production (lye, soap, potash only per spec)
          if (['LYE_MAKING', 'SOAP_MAKING', 'POTASH_MAKING', 'LYE', 'SOAP', 'POTASH'].includes(s)) return 'Industry';
          
          // MISCELLANEOUS - No All-Star (crutch walk only per spec)
          if (['CRUTCH_WALK', 'CRUTCH_WALKING'].includes(s)) return 'Miscellaneous';
          
          // Last resort keyword matching
          if (s.includes('DODGE') || s.includes('ARMOR') || s.includes('SHIELD') || s.includes('WRESTLE') || s.includes('GRASP') || s.includes('STANCE') || s.includes('MELEE') || s.includes('RANGED') || s.includes('BITE')) return 'Combat';
          if (s.includes('SWORD') || s.includes('AXE') || s.includes('MACE') || s.includes('HAMMER') || s.includes('SPEAR') || s.includes('BOW') || s.includes('CROSSBOW') || s.includes('DAGGER') || s.includes('KNIFE') || s.includes('WHIP') || s.includes('PIKE') || s.includes('THROW') || s.includes('BLOWGUN')) return 'Weaponry';
          if (s.includes('SIEGE')) return 'Siegecraft';
          if (s.includes('FORGE') || s.includes('SMELT') || s.includes('EXTRACT_STRAND') || s.includes('METALCRAFT')) return 'Smithing';
          if (s.includes('STONE') || s.includes('MASON') || s.includes('GEM') || s.includes('ENCRUST') || s.includes('MINING') || s.includes('CARVE')) return 'Stoneworking';
          if (s.includes('WOOD') || s.includes('CARPENT') || s.includes('BOWYER') || s.includes('LUMBER') || s.includes('WOODCUT')) return 'Woodworking';
          if (s.includes('SPIN') || s.includes('WEAVE') || s.includes('CLOTH') || s.includes('LEATHER') || s.includes('TANNER') || s.includes('DYE') || s.includes('SHEAR')) return 'Textile Arts';
          if (s.includes('BONE') || s.includes('GLASS') || s.includes('POTTER') || s.includes('GLAZ') || s.includes('WAX')) return 'Crafting';
          if (s.includes('MECHANIC') || s.includes('PUMP') || s.includes('ENGINEER') || s.includes('GEAR') || s.includes('AXLE') || s.includes('WHEEL') || s.includes('LEVER')) return 'Engineering';
          if (s.includes('DRESS_WOUND') || s.includes('SUTURE') || s.includes('DIAGNOSE') || s.includes('SURGERY') || s.includes('SET_BONE') || s.includes('PHYSICIAN') || s.includes('DOCTOR') || s.includes('MEDIC')) return 'Medicine';
          if (s.includes('HERB') || s.includes('PLANT') || s.includes('MILL') || s.includes('PRESS') || s.includes('BREW') || s.includes('CHEESE') || s.includes('BEE')) return 'Agriculture';
          if (s.includes('COOK') || s.includes('BUTCHER') || s.includes('GELD') || s.includes('MILK') || s.includes('FISH') || s.includes('PROCESSFISH')) return 'Foodcraft';
          if (s.includes('ANIMAL') || s.includes('TAME') || s.includes('TRAIN') || s.includes('RIDING') || s.includes('TRAP')) return 'Animal Handling';
          if (s.includes('LEADERSHIP') || s.includes('DISCIPLINE') || s.includes('TACTICS') || s.includes('TEACH') || s.includes('SITUATIONAL_AWARENESS') || s.includes('ORGANIZATION') || s.includes('COMMAND')) return 'Command';
          if (s.includes('JUDGING') || s.includes('NEGOTIATION') || s.includes('COMEDY') || s.includes('PACIFY') || s.includes('INTIMIDATION') || s.includes('PERSUASION') || s.includes('CONSOLE') || s.includes('FLATTERY') || s.includes('SPEAKING') || s.includes('LYING') || s.includes('INTRIGUE')) return 'Social Arts';
          if (s.includes('WRITING') || s.includes('POETRY') || s.includes('RECORD') || s.includes('PROSE') || s.includes('READING') || s.includes('THINKING') || s.includes('ASTRONOMY') || s.includes('LOGIC') || s.includes('GEOGRAPHY') || s.includes('PAPER') || s.includes('CHEMISTRY') || s.includes('BOOKBIND') || s.includes('MATHEMATICS') || s.includes('KNOWLEDGE') || s.includes('APPRAIS') || s.includes('CONCENTRATION')) return 'Scholarship';
          if (s.includes('MUSIC') || s.includes('DANCE') || s.includes('SING') || s.includes('PLAY_') || s.includes('INSTRUMENT') || s.includes('PERFORM')) return 'Performance';
          if (s.includes('CLIMB') || s.includes('SWIM')) return 'Athletics';
          if (s.includes('DISSECT_VERMIN') || s.includes('SNEAK') || s.includes('TRACK')) return 'Survival';
          if (s.includes('LYE') || s.includes('SOAP') || s.includes('POTASH')) return 'Industry';
          if (s.includes('CRUTCH')) return 'Miscellaneous';
          
          // Default fallback
          return 'Miscellaneous';
        };
        
        // Track skill data per category and per figure for best master calculation
        const skillMap = new Map<string, { count: number; category: string; figures: { name: string; totalIp: number }[] }>();
        // Track category totals per figure: category -> figureId -> totalIp
        const categoryFigureTotals = new Map<string, Map<string, number>>();
        
        figuresWithSkills.forEach(f => {
          f.hfSkills?.forEach(s => {
            const skillName = s.skill.toUpperCase();
            const category = getSkillCategory(skillName);
            
            // Track individual skill data (normalized to uppercase to prevent duplicates)
            const existing = skillMap.get(skillName) || { count: 0, category, figures: [] };
            existing.count++;
            existing.figures.push({ name: f.name, totalIp: s.totalIp });
            skillMap.set(skillName, existing);
            
            // Track category totals for best master calculation
            if (!categoryFigureTotals.has(category)) {
              categoryFigureTotals.set(category, new Map());
            }
            const figureTotals = categoryFigureTotals.get(category)!;
            const currentTotal = figureTotals.get(f.name) || 0;
            figureTotals.set(f.name, currentTotal + s.totalIp);
          });
        });
        
        // Group by category
        const categoryMap = new Map<string, { skill: string; count: number; topFigures: { name: string; skillLevel: number }[] }[]>();
        
        skillMap.forEach((data, skill) => {
          const category = data.category;
          const existing = categoryMap.get(category) || [];
          existing.push({
            skill,
            count: data.count,
            topFigures: data.figures
              .sort((a, b) => b.totalIp - a.totalIp)
              .slice(0, 3)
              .map(f => ({ name: f.name, skillLevel: Math.floor(f.totalIp / 100) }))
          });
          categoryMap.set(category, existing);
        });
        
        // Calculate best master for each category
        const categoryBestMaster = new Map<string, { name: string; totalIp: number }>();
        categoryFigureTotals.forEach((figureTotals, category) => {
          let bestName = '';
          let bestTotal = -1;
          figureTotals.forEach((total, name) => {
            if (total > bestTotal) {
              bestTotal = total;
              bestName = name;
            }
          });
          if (bestName) {
            categoryBestMaster.set(category, { name: bestName, totalIp: bestTotal });
          }
        });
        
        // Fallback: ensure categories with skills have a best master
        // (handles edge case where skills exist but IP calculation had issues)
        categoryMap.forEach((skills, category) => {
          if (!categoryBestMaster.has(category) && skills.length > 0) {
            // Find the figure with highest total IP across all skills in this category
            const figureTotals = new Map<string, number>();
            skills.forEach(skill => {
              skill.topFigures.forEach(fig => {
                const current = figureTotals.get(fig.name) || 0;
                figureTotals.set(fig.name, current + fig.skillLevel * 100);
              });
            });
            
            let bestName = '';
            let bestTotal = -1;
            figureTotals.forEach((total, name) => {
              if (total > bestTotal) {
                bestTotal = total;
                bestName = name;
              }
            });
            
            if (bestName) {
              categoryBestMaster.set(category, { name: bestName, totalIp: bestTotal });
            }
          }
        });
        
        // Sort categories and skills within each category
        const categoryOrder = ['Combat', 'Weaponry', 'Siegecraft', 'Smithing', 'Stoneworking', 'Woodworking', 'Textile Arts', 'Crafting', 'Engineering', 'Medicine', 'Agriculture', 'Foodcraft', 'Animal Handling', 'Command', 'Social Arts', 'Scholarship', 'Performance', 'Athletics', 'Survival', 'Industry', 'Miscellaneous'];
        
        const groupedSkills = Array.from(categoryMap.entries())
          .map(([category, skills]) => ({
            category,
            bestMaster: categoryBestMaster.get(category) || null,
            skills: skills.sort((a, b) => b.count - a.count)
          }))
          .sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));
        
        // Debug logging for Athletics category
        const athleticsData = groupedSkills.find(g => g.category === 'Athletics');
        if (athleticsData) {
          console.log('Athletics category:', {
            skills: athleticsData.skills.map(s => ({ skill: s.skill, count: s.count })),
            bestMaster: athleticsData.bestMaster,
            categoryFigureTotals: categoryFigureTotals.get('Athletics') 
              ? Object.fromEntries(categoryFigureTotals.get('Athletics')!)
              : null
          });
        }
        
        setSkillsData(groupedSkills);

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
      {/* Year */}
      <section className="world-header">
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
                  <span className="civ-stat-value">{strongestCiv.members.toLocaleString()}</span>
                  <span className="civ-stat-label">population</span>
                </div>
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
              <div className="legend-meta">{strongestCiv.entity.race || 'Unknown Race'}</div>
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

      {/* Row 1 - Artifacts & Site Types */}
      <section className="info-row">
        {/* Artifact Holders */}
        {artifactHolders.length > 0 && (
          <div className="info-card">
            <div className="info-header">
              <span className="info-icon">💎</span>
              <span className="info-title">Artifact Keepers</span>
            </div>
            <div className="info-bars">
              {artifactHolders.map((holder, idx) => {
                const colors = ['#d4a373', '#2a9d8f', '#e9c46a', '#e76f51', '#9b2226', '#6b6b6b'];
                const color = colors[idx % colors.length];
                return (
                  <div key={idx} className="info-bar">
                    <div className="info-bar-row">
                      <span className="info-bar-name">{holder.entity.name}</span>
                      <span className="info-bar-value">{holder.count}</span>
                    </div>
                    <div className="info-bar-track">
                      <div 
                        className="info-bar-fill"
                        style={{ width: `${Math.max(holder.percentage, 1)}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="info-bar-percent">{holder.percentage.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Site Types */}
        {siteTypes.length > 0 && (
          <div className="info-card">
            <div className="info-header">
              <span className="info-icon">🏰</span>
              <span className="info-title">Site Types</span>
            </div>
            <div className="info-bars">
              {siteTypes.map((site, idx) => {
                const colors = ['#d4a373', '#2a9d8f', '#e9c46a', '#e76f51', '#9b2226', '#6b6b6b'];
                const color = colors[idx % colors.length];
                return (
                  <div key={idx} className="info-bar">
                    <div className="info-bar-row">
                      <span className="info-bar-name">{site.type}</span>
                      <span className="info-bar-value">{site.count}</span>
                    </div>
                    <div className="info-bar-track">
                      <div 
                        className="info-bar-fill"
                        style={{ width: `${Math.max(site.percentage, 1)}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="info-bar-percent">{site.percentage.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Row 2 - Deities & (placeholder for future card) */}
      <section className="info-row">
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

      {/* Artifacts Section */}
      <ArtifactsCard />

      {/* Guild Hall - Professions & Masters */}
      {skillsData.length > 0 && (
        <GuildHall skillsData={skillsData} />
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
