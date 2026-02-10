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
    'Warfare': 'Warlord',
    'Metalworking': 'Master Smith',
    'Craftsmanship': 'Artisan Supreme',
    'Construction': 'High Builder',
    'Healing': 'Grand Healer',
    'Agriculture': 'Harvest Sovereign',
    'Animal Arts': 'Beastmaster',
    'Woodsmanship': 'Forest King',
    'Fishing': 'Lord of Waters',
    'Commerce': 'Trade Prince',
    'Social Arts': 'Grand Diplomat',
    'Scholarship': 'Sage',
    'Records & Lore': 'Loremaster',
    'Performance': 'Legendary Performer',
    'Athletics': 'Champion',
    'Industry': 'Production Chief',
    'Service': 'Master Servant',
    'Survival': 'Wilderness Guide',
    'Subterfuge': 'Shadow Master',
    'Mental Discipline': 'Mind Sage',
    'Supernatural': 'Mystic',
    'Miscellaneous': 'Jack of All Trades'
  };
  return titles[category] || 'Master';
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
        
        // Skill category mapping - reorganized into logical groups
        const getSkillCategory = (skill: string): string => {
          const s = skill.toUpperCase();
          
          // WARFARE - All combat skills, weapons, armor, tactics
          if (['SWORD', 'SWORDS', 'SWORDSMANSHIP', 'SWORDSMAN', 'AXE', 'AXEMAN', 'AXEMANSHIP', 'MACE', 'MACEMAN', 'MACEMANSHIP', 'HAMMER', 'HAMMERMAN', 'HAMMERMANSHIP', 'SPEAR', 'SPEARMAN', 'SPEARMANSHIP', 'PIKE', 'PIKEMAN', 'PIKEMANSHIP', 'CROSSBOW', 'CROSSBOWMAN', 'BOW', 'BOWMAN', 'BOWYER', 'DAGGER', 'KNIFE', 'WHIP', 'SCOURGE', 'ARMOR', 'ARMOR_USER', 'SHIELD', 'SHIELD_USER', 'DODGE', 'DODGING', 'WRESTLE', 'WRESTLING', 'BITE', 'GRASP', 'GRASP_STRIKE', 'STANCE', 'STANCE_STRIKE', 'MELEE', 'MELEE_COMBAT', 'RANGED', 'RANGED_COMBAT', 'THROW', 'THROWING', 'SIEGE', 'SIEGEOPERATE', 'SIEGE_OPERATE', 'LEADERSHIP', 'TEACHING', 'MILITARY_TACTICS', 'DISCIPLINE', 'TACTICS', 'COMBAT', 'WAR', 'FIGHTING', 'PARRY', 'BLOCK', 'KICK', 'PUNCH', 'STRIKE', 'SIEGE_ENGINEERING', 'SIEGE_ENGINEER', 'BALLISTA', 'CATAPULT'].includes(s)) return 'Warfare';
          
          // METALWORKING - All smithing, smelting, forging, gems
          if (['WEAPONSMITH', 'WEAPONSMITHING', 'ARMORSMITH', 'ARMORSMITHING', 'BLACKSMITH', 'BLACKSMITHING', 'METALCRAFT', 'SMELT', 'SMELTING', 'FORGE_WEAPON', 'FORGE_ARMOR', 'FORGE_FURNITURE', 'CUTGEM', 'CUT_GEM', 'ENCRUSTGEM', 'ENCRUST_GEM', 'EXTRACT_STRAND', 'METALLURGY'].includes(s)) return 'Metalworking';
          
          // CRAFTSMANSHIP - Wood, stone, glass, leather, cloth, crafts
          if (['CARPENTRY', 'WOODCRAFT', 'STONECRAFT', 'POTTERY', 'GLASSMAKER', 'GLASSMAKING', 'LEATHERWORK', 'LEATHERWORKING', 'CLOTHESMAKING', 'TANNING', 'TANNER', 'DYER', 'DYEING', 'WEAVING', 'SPINNING', 'PAPERMAKING', 'BOOKBINDING', 'WAX_WORKING', 'GEM_SETTING', 'BONE_CARVE', 'BONE_CARVING', 'IVORY_CARVE', 'IVORY_CARVING', 'STONE_CARVE', 'STONE_CARVING', 'WOOD_CARVE', 'WOOD_CARVING'].includes(s)) return 'Craftsmanship';
          
          // CONSTRUCTION - Building, architecture, mechanics, mining, masonry
          if (['MINING', 'MASONRY', 'ARCHITECTURE', 'ARCHITECT', 'DESIGNBUILDING', 'DESIGN_BUILDING', 'MECHANICS', 'MECHANIC', 'OPERATE_PUMP', 'PUMP_OPERATION', 'PUMP', 'DETAILSTONE', 'DETAIL_STONE', 'ENCASEFORTIFICATION', 'ENCASE_FORTIFICATION', 'CONSOLEFORTIFICATION', 'CONSOLE_FORTIFICATION', 'CONSTRUCTION', 'BUILDING'].includes(s)) return 'Construction';
          
          // HEALING - All medical skills
          if (['DIAGNOSE', 'DIAGNOSIS', 'SURGERY', 'SURGEON', 'SET_BONE', 'SET_BONES', 'SUTURE', 'SUTURING', 'DRESS_WOUNDS', 'DRESSING_WOUNDS', 'WOUND_DRESSING', 'CRUTCH_WALK', 'CRUTCH_WALKING', 'PHYSICIAN', 'DOCTOR', 'MEDIC', 'FIRST_AID'].includes(s)) return 'Healing';
          
          // AGRICULTURE - Farming, plants, food production
          if (['GROWING', 'PLANT', 'PLANTS', 'HERBALISM', 'HERBALIST', 'FARMING', 'FARMING_FIELD', 'MILLING', 'PROCESSPLANTS', 'PROCESS_PLANTS', 'BREWING', 'COOKING', 'CHEESEMAKING', 'PRESSING', 'BEEKEEPING', 'BEE_KEEPING', 'WAX_WORKING', 'GARDENING', 'CULTIVATION', 'THRESHING', 'BUTCHER', 'BUTCHERING'].includes(s)) return 'Agriculture';
          
          // ANIMAL ARTS - Animal care, hunting, everything animal-related
          if (['ANIMALCARE', 'ANIMAL_CARE', 'ANIMALTRAIN', 'ANIMAL_TRAIN', 'TRAIN_ANIMALS', 'TAME', 'TAMING', 'RIDING', 'RIDER', 'HUNTING', 'HUNTER', 'TRAPPING', 'SNEAK', 'SNEAKING', 'AMBUSH', 'AMBUSHING', 'MILK', 'MILKING', 'SHEAR', 'SHEARER', 'SHEARING', 'POULTRY', 'POULTRY_KEEPING', 'ANIMAL_DISSECT', 'ANIMAL_DISSECTION'].includes(s)) return 'Animal Arts';
          
          // FISHING - All fish-related
          if (['FISH', 'FISHING', 'CLEAN_FISH', 'FISH_CLEANING', 'DISSECT_FISH', 'FISH_DISSECTION'].includes(s)) return 'Fishing';
          
          // SOCIAL ARTS - Leadership, persuasion, social skills
          if (['LEADERSHIP', 'TEACHING', 'PERSUASION', 'NEGOTIATION', 'CONSULT', 'CONSULTING', 'JUDGING_INTENT', 'APPRAISAL', 'FLATTERY', 'INTIMIDATION', 'CONVERSATION', 'COMEDY', 'PACIFY', 'PACIFICATION', 'CONSOLE', 'CONSOLATION', 'LYING', 'ORGANIZATION', 'MANAGEMENT', 'LAW', 'JUDGING', 'DIPLOMACY', 'PUBLIC_SPEAKING'].includes(s)) return 'Social Arts';
          
          // SCHOLARSHIP - Knowledge, research, mental skills
          if (['KNOWLEDGE', 'STUDENT', 'RESEARCHER', 'RESEARCH', 'CRITICAL_THINKING', 'LOGIC', 'MATHEMATICS', 'ASTRONOMY', 'CHEMISTRY', 'BIOLOGY', 'GEOGRAPHY', 'MEDICAL_KNOWLEDGE', 'MEDICINE', 'SCHOLAR', 'SCIENCE', 'STRATEGY', 'TRACKING', 'OBSERVATION'].includes(s)) return 'Scholarship';
          
          // RECORDS & ADMIN - Writing, record keeping, accounting
          if (['RECORD_KEEPING', 'WRITING', 'WRITER', 'READING', 'READER', 'SPEAKING', 'SPEAKER', 'PROSE', 'POETRY', 'POET', 'STORYTELLING', 'STORYTELLER', 'BOOKBINDING', 'SCROLL', 'LITERACY', 'ADMINISTRATION', 'ACCOUNTING'].includes(s)) return 'Records & Lore';
          
          // PERFORMANCE - Music, dance, entertainment
          if (['MUSIC', 'MUSICIAN', 'SINGING', 'SINGER', 'DANCING', 'DANCER', 'PLAY_KEYBOARD', 'PLAY_STRING', 'PLAY_WIND', 'PLAY_PERCUSSION', 'PERFORMANCE', 'INSTRUMENT', 'ACTING', 'COMEDY'].includes(s)) return 'Performance';
          
          // ATHLETICS - Physical activities, movement
          if (['CLIMBING', 'CLIMBER', 'SWIMMING', 'SWIMMER', 'THROW', 'THROWING', 'BALANCE', 'COORDINATION', 'SITUATIONAL_AWARENESS', 'KINESIOLOGIC_AWARENESS', 'DIRECTION_SENSE', 'ATHLETICS', 'FITNESS', 'RUNNING', 'JUMPING'].includes(s)) return 'Athletics';
          
          // SERVICE - Cleaning, laundry, low-skill labor
          if (['LAUNDERING', 'CLEANING', 'HAULING', 'SERVANT', 'PEASANT', 'LABOR', 'FOOD_PREP', 'PREPARE_FOOD', 'PLANT_GATHERING', 'FOOD_PRODUCTION', 'FOOD_PROCESSING', 'PROCESS_FOOD'].includes(s)) return 'Service';
          
          // WOODSMANSHIP - Wood cutting, forestry, nature gathering
          if (['WOODCUTTING', 'WOOD_CUTTING', 'CARPENTRY', 'FORESTRY', 'LUMBER', 'LUMBERJACK', 'WOODSMAN', 'CARTOGRAPHY', 'NAVIGATION'].includes(s)) return 'Woodsmanship';
          
          // INDUSTRY - Chemical production, materials processing
          if (['SOAP_MAKING', 'LYE_MAKING', 'POTASH_MAKING', 'ASH_PRODUCTION', 'RENDER_FAT', 'GLAZING', 'POTASH', 'LYE', 'SOAP', 'RENDERING', 'ASH', 'FIRE_MAKING', 'FIRE Starting'].includes(s)) return 'Industry';
          
          // SUBTERFUGE - Stealth, theft, trickery
          if (['LOCKPICKING', 'PICKPOCKET', 'STEALING', 'STEALTH', 'DISGUISE', 'POISON', 'POISONING', 'TRAPS', 'TRAP_ENGINEERING'].includes(s)) return 'Subterfuge';
          
          // COMMERCE - Trading, appraisal, valuation
          if (['TRADE', 'TRADING', 'MERCHANT', 'BARGAINING', 'EVALUATE_GOOD', 'EVALUATE_GOODS', 'APPRAISAL', 'PRICE', 'VALUE', 'COMMERCE', 'BUSINESS', 'PROFIT'].includes(s)) return 'Commerce';
          
          // SURVIVAL - Wilderness, primitive skills
          if (['KNAPPING', 'BONE_CARVE', 'BONE_CARVING', 'FORAGE', 'FORAGING', 'WILDERNESS', 'SURVIVAL', 'CAMPING', 'SHELTER', 'FIRE_BUILDING', 'PRIMITIVE'].includes(s)) return 'Survival';
          
          // MENTAL - Memory, willpower, focus
          if (['MEMORY', 'WILLPOWER', 'FOCUS', 'CONCENTRATION', 'PATIENCE', 'DISCIPLINE', 'MEDITATION', 'MIND', 'MENTAL', 'PSYCHIC', 'INTUITION'].includes(s)) return 'Mental Discipline';
          
          // SUPERNATURAL - Magic, divine, weird stuff
          if (['MAGIC', 'SPELL', 'RITUAL', 'NECROMANCY', 'DIVINATION', 'PROPHECY', 'CURSE', 'BLESSING', 'COMMUNE', 'SPIRIT', 'GHOST', 'UNDEAD', 'VAMPIRE', 'WEREWOLF', 'LYCANTHROPY', 'POSSESSION', 'EXORCISM'].includes(s)) return 'Supernatural';
          
          // MISCELLANEOUS - Anything that doesn't fit elsewhere
          return 'Miscellaneous';
        };
        
        // Track skill data per category and per figure for best master calculation
        const skillMap = new Map<string, { count: number; category: string; figures: { name: string; totalIp: number }[] }>();
        // Track category totals per figure: category -> figureId -> totalIp
        const categoryFigureTotals = new Map<string, Map<string, number>>();
        
        figuresWithSkills.forEach(f => {
          f.hfSkills?.forEach(s => {
            const category = getSkillCategory(s.skill);
            
            // Track individual skill data
            const existing = skillMap.get(s.skill) || { count: 0, category, figures: [] };
            existing.count++;
            existing.figures.push({ name: f.name, totalIp: s.totalIp });
            skillMap.set(s.skill, existing);
            
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
          let bestTotal = 0;
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
        
        // Sort categories and skills within each category
        const categoryOrder = ['Warfare', 'Metalworking', 'Craftsmanship', 'Construction', 'Healing', 'Agriculture', 'Animal Arts', 'Woodsmanship', 'Fishing', 'Commerce', 'Social Arts', 'Scholarship', 'Records & Lore', 'Performance', 'Athletics', 'Industry', 'Service', 'Survival', 'Subterfuge', 'Mental Discipline', 'Supernatural', 'Miscellaneous'];
        
        const groupedSkills = Array.from(categoryMap.entries())
          .map(([category, skills]) => ({
            category,
            bestMaster: categoryBestMaster.get(category) || null,
            skills: skills.sort((a, b) => b.count - a.count)
          }))
          .sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));
        
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

      {/* Wide Card - Skills by Category */}
      {skillsData.length > 0 && (
        <section className="skills-section">
          <div className="skills-card">
            <div className="skills-header">
              <span className="skills-icon">📜</span>
              <span className="skills-title">Professions & Masters</span>
            </div>
            {skillsData.map((categoryData, cidx) => (
              <div key={cidx} className="skill-category">
                <div className="skill-category-header">
                  <h4 className="skill-category-title">{categoryData.category}</h4>
                  {categoryData.bestMaster && (
                    <div className="category-best-master">
                      <span className="best-master-crown">👑</span>
                      <div className="best-master-info">
                        <span className="best-master-title">{getCategoryBestTitle(categoryData.category)}</span>
                        <span className="best-master-name">{categoryData.bestMaster.name}</span>
                      </div>
                      <span className="best-master-level">{Math.floor(categoryData.bestMaster.totalIp / 100)}</span>
                    </div>
                  )}
                </div>
                <div className="skills-grid">
                  {categoryData.skills.map((skillData, sidx) => (
                    <div key={sidx} className="skill-column">
                      <div className="skill-header">
                        <div className="skill-name">{skillData.skill.replace(/_/g, ' ').toLowerCase()}</div>
                        <div className="skill-count">{skillData.count.toLocaleString()} practitioners</div>
                      </div>
                      <div className="skill-masters">
                        {skillData.topFigures.map((fig, fidx) => (
                          <div key={fidx} className="skill-master">
                            <span className="master-rank">#{fidx + 1}</span>
                            <span className="master-name">{fig.name}</span>
                            <span className="master-level">Lv.{fig.skillLevel}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
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
