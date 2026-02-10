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
    'Gem Working': 'Gem Sage',
    'Stoneworking': 'Stone Master',
    'Woodworking': 'Wood Sage',
    'Fiber & Leather': 'Master Tailor',
    'Pottery & Glass': 'Ceramic Master',
    'Organic Crafts': 'Bone Artisan',
    'Construction': 'High Builder',
    'Engineering': 'Master Engineer',
    'Healing': 'Grand Healer',
    'Agriculture': 'Harvest Sovereign',
    'Food Preparation': 'Master Chef',
    'Animal Care': 'Beastmaster',
    'Animal Products': 'Husbandry Master',
    'Hunting & Trapping': 'Master Hunter',
    'Fishing': 'Lord of Waters',
    'Riding': 'Master Rider',
    'Vehicle Operation': 'Wagon Master',
    'Leadership': 'High Commander',
    'Social Arts': 'Grand Diplomat',
    'Scholarship': 'Sage',
    'Teaching & Education': 'Grand Professor',
    'Writing & Records': 'Master Scribe',
    'Literature': 'Master Author',
    'Speech': 'Orator Supreme',
    'Music': 'Virtuoso',
    'Dance': 'Choreography Master',
    'Comedy': 'Court Jester',
    'Athletics': 'Champion',
    'Awareness': 'Master Observer',
    'Industry': 'Production Chief',
    'Mining & Refining': 'Mine Lord',
    'Trade & Commerce': 'Trade Prince',
    'Law & Order': 'High Judge',
    'Thievery': 'Master Thief',
    'Stealth': 'Shadow Walker',
    'Traps & Trickery': 'Trap Master',
    'Survival': 'Wilderness Guide',
    'Gathering': 'Master Gatherer',
    'Dissection': 'Master Anatomist',
    'Vermin Handling': 'Vermin Lord',
    'Labor': 'Foreman',
    'Economic': 'Master Financier',
    'Religion': 'High Priest',
    'Magic': 'Archmage',
    'Nature & Druidism': 'Archdruid',
    'Mental Discipline': 'Mind Sage',
    'Memory & Learning': 'Memory Master',
    'Patience & Temperament': 'Zen Master',
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
        
        // Skill category mapping - comprehensive coverage of ALL Dwarf Fortress skills
        const getSkillCategory = (skill: string): string => {
          const s = skill.toUpperCase();
          
          // WARFARE - All weapons, armor, combat, military
          if (['SWORD', 'SWORDS', 'SWORDSMANSHIP', 'SWORDSMAN', 'AXE', 'AXEMAN', 'AXEMANSHIP', 'MACE', 'MACEMAN', 'MACEMANSHIP', 'HAMMER', 'HAMMERMAN', 'HAMMERMANSHIP', 'SPEAR', 'SPEARMAN', 'SPEARMANSHIP', 'PIKE', 'PIKEMAN', 'PIKEMANSHIP', 'CROSSBOW', 'CROSSBOWMAN', 'BOW', 'BOWMAN', 'BOWYER', 'DAGGER', 'KNIFE', 'WHIP', 'SCOURGE', 'BLOWGUN', 'BLOW_GUN', 'BLOWGUNMAN', 'ARMOR', 'ARMOR_USER', 'SHIELD', 'SHIELD_USER', 'DODGE', 'DODGING', 'WRESTLE', 'WRESTLING', 'BITE', 'GRASP', 'GRASP_STRIKE', 'STANCE', 'STANCE_STRIKE', 'MELEE', 'MELEE_COMBAT', 'RANGED', 'RANGED_COMBAT', 'THROW', 'THROWING', 'SIEGE', 'SIEGEOPERATE', 'SIEGE_OPERATE', 'SIEGE_ENGINEERING', 'SIEGE_ENGINEER', 'BALLISTA', 'CATAPULT', 'LEADERSHIP', 'TEACHING', 'MILITARY_TACTICS', 'DISCIPLINE', 'TACTICS', 'COMBAT', 'WAR', 'FIGHTING', 'PARRY', 'BLOCK', 'KICK', 'PUNCH', 'STRIKE', 'SQUAD', 'COMMAND'].includes(s)) return 'Warfare';
          
          // METALWORKING - Smithing, smelting, forging, strand extraction
          if (['WEAPONSMITH', 'WEAPONSMITHING', 'ARMORSMITH', 'ARMORSMITHING', 'BLACKSMITH', 'BLACKSMITHING', 'METALCRAFT', 'SMELT', 'SMELTING', 'FORGE_WEAPON', 'FORGE_ARMOR', 'FORGE_FURNITURE', 'EXTRACT_STRAND', 'STRAND_EXTRACT', 'METALLURGY'].includes(s)) return 'Metalworking';
          
          // GEMS & ENCRUSTING - Gems, cutting, setting, encrusting
          if (['CUTGEM', 'CUT_GEM', 'ENCRUSTGEM', 'ENCRUST_GEM', 'GEM_CUTTING', 'GEM_SETTING', 'GEM_ENCRUSTING', 'JEWELER', 'JEWELRY', 'GEMS', 'GEM_CRAFT'].includes(s)) return 'Gem Working';
          
          // STONEWORKING - Stone crafts, detailing, carving, masonry
          if (['STONECRAFT', 'DETAILSTONE', 'DETAIL_STONE', 'STONE_CARVE', 'STONE_CARVING', 'ENCASEFORTIFICATION', 'ENCASE_FORTIFICATION', 'CONSOLEFORTIFICATION', 'CONSOLE_FORTIFICATION', 'MASONRY', 'STONE', 'ROCK_CRAFT', 'STONE_DRESSING', 'STONE_DETAILING'].includes(s)) return 'Stoneworking';
          
          // WOODWORKING - Carpentry, wood crafts, carving, cutting
          if (['CARPENTRY', 'WOODCRAFT', 'WOOD_CARVE', 'WOOD_CARVING', 'WOODCUTTING', 'WOOD_CUTTING', 'FORESTRY', 'LUMBER', 'LUMBERJACK', 'WOODSMAN', 'FURNITURE', 'WOODWORK'].includes(s)) return 'Woodworking';
          
          // FIBER & LEATHER - Cloth, leather, weaving, tailoring
          if (['LEATHERWORK', 'LEATHERWORKING', 'CLOTHESMAKING', 'TANNING', 'TANNER', 'DYER', 'DYEING', 'WEAVING', 'SPINNING', 'CLOTH', 'TAILOR', 'SEWING', 'KNITTING', 'EMBROIDERY', 'LEATHER_CRAFT', 'CLOTH_CRAFT'].includes(s)) return 'Fiber & Leather';
          
          // POTTERY & GLASS - Ceramics, glassmaking, glazing
          if (['POTTERY', 'GLASSMAKER', 'GLASSMAKING', 'GLAZING', 'CERAMICS', 'KILN', 'CLAY', 'GLASS_CRAFT', 'PORCELAIN'].includes(s)) return 'Pottery & Glass';
          
          // ORGANIC CRAFTS - Bone, ivory, shell, horn, pearl
          if (['BONE_CARVE', 'BONE_CARVING', 'IVORY_CARVE', 'IVORY_CARVING', 'SHELL_CRAFT', 'HORN_CRAFT', 'PEARL_CRAFT', 'CORAL_CRAFT', 'SHELL', 'BONE', 'IVORY', 'HORN', 'PEARL'].includes(s)) return 'Organic Crafts';
          
          // CONSTRUCTION - Architecture, mechanics, mining, pumps
          if (['MINING', 'ARCHITECTURE', 'ARCHITECT', 'DESIGNBUILDING', 'DESIGN_BUILDING', 'MECHANICS', 'MECHANIC', 'OPERATE_PUMP', 'PUMP_OPERATION', 'PUMP', 'CONSTRUCTION', 'BUILDING', 'WALL', 'FLOOR', 'ROOF', 'SUPPORT', 'CHANNEL', 'RAMP', 'STAIR', 'FORTIFICATION', 'BRIDGE', 'ROAD', 'WELL'].includes(s)) return 'Construction';
          
          // ENGINEERING - Complex machinery, siege, trap engineering
          if (['TRAP_ENGINEERING', 'TRAP_COMPONENT', 'LINK', 'MECHANISM', 'GEAR_ASSEMBLY', 'AXLE', 'WATER_WHEEL', 'WINDMILL', 'SCREW_PUMP', 'PISTON', 'LEVER', 'PRESSURE_PLATE', 'CAGE_TRAP', 'STONE_TRAP', 'WEAPON_TRAP', 'SPIKE', 'SERRATED_DISC', 'MENACING_SPIKE', 'GIANT_AXE', 'ENORMOUS_CORKSCREW'].includes(s)) return 'Engineering';
          
          // HEALING - All medical skills
          if (['DIAGNOSE', 'DIAGNOSIS', 'SURGERY', 'SURGEON', 'SET_BONE', 'SET_BONES', 'SUTURE', 'SUTURING', 'DRESS_WOUNDS', 'DRESSING_WOUNDS', 'WOUND_DRESSING', 'CRUTCH_WALK', 'CRUTCH_WALKING', 'PHYSICIAN', 'DOCTOR', 'MEDIC', 'FIRST_AID', 'BANDAGE', 'SPLINT', 'CAST', 'MEDICAL_PRACTICE'].includes(s)) return 'Healing';
          
          // AGRICULTURE - Farming, plants, brewing, cooking
          if (['GROWING', 'PLANT', 'PLANTS', 'HERBALISM', 'HERBALIST', 'FARMING', 'FARMING_FIELD', 'MILLING', 'PROCESSPLANTS', 'PROCESS_PLANTS', 'BREWING', 'COOKING', 'CHEESEMAKING', 'PRESSING', 'BEEKEEPING', 'BEE_KEEPING', 'WAX_WORKING', 'GARDENING', 'CULTIVATION', 'THRESHING', 'QUERN', 'MILLSTONE', 'PLANT_PROCESSING'].includes(s)) return 'Agriculture';
          
          // FOOD PREPARATION - Butchery, cleaning, processing
          if (['BUTCHER', 'BUTCHERING', 'CLEAN', 'CLEANING', 'GUT', 'GUTTING', 'PREPARE_MEAL', 'MEAL_PREPARATION', 'KITCHEN', 'COOK', 'CHEF', 'BAKING', 'SLAUGHTER', 'MEAT_CRAFT', 'FAT_RENDERING', 'RENDER_FAT', 'TALLOW'].includes(s)) return 'Food Preparation';
          
          // ANIMAL CARE - Animal training, care, gelding
          if (['ANIMALCARE', 'ANIMAL_CARE', 'ANIMALTRAIN', 'ANIMAL_TRAIN', 'TRAIN_ANIMALS', 'TAME', 'TAMING', 'TRAINING', 'PET', 'WAR_TRAIN', 'HUNT_TRAIN', 'GELD', 'GELDING', 'CASTRATE', 'CASTRATION', 'KENNEL', 'PASTURE', 'ZOO', 'WAR_ANIMAL', 'HUNTING_ANIMAL', 'GUARD_ANIMAL'].includes(s)) return 'Animal Care';
          
          // ANIMAL PRODUCTS - Milking, shearing, egg collection
          if (['MILK', 'MILKING', 'SHEAR', 'SHEARER', 'SHEARING', 'POULTRY', 'POULTRY_KEEPING', 'EGG', 'EGG_COLLECTION', 'HONEY', 'HONEY_COLLECTING', 'WAX', 'BEESWAX', 'SILK', 'SHEEP', 'GOAT', 'COW', 'YAK', 'ALPACA'].includes(s)) return 'Animal Products';
          
          // HUNTING & TRAPPING - Hunting, ambush, trapping, sneaking
          if (['HUNTING', 'HUNTER', 'TRAPPING', 'SNEAK', 'SNEAKING', 'AMBUSH', 'AMBUSHING', 'STALK', 'STALKING', 'TRACK', 'TRACKING', 'CAGE_TRAP', 'ANIMAL_TRAP', 'LEASH', 'RESTRAINT', 'GAME_KEEPING', 'WILDLIFE'].includes(s)) return 'Hunting & Trapping';
          
          // FISHING - All fish-related
          if (['FISH', 'FISHING', 'CLEAN_FISH', 'FISH_CLEANING', 'DISSECT_FISH', 'FISH_DISSECTION', 'FISHERMAN', 'FISHERY', 'AQUACULTURE', 'NET', 'ROD', 'LINE_FISHING'].includes(s)) return 'Fishing';
          
          // RIDING - All mount-related skills
          if (['RIDING', 'RIDER', 'MOUNT', 'MOUNTED_COMBAT', 'CAVALRY', 'HORSE', 'CAMEL', 'ELEPHANT', 'GRIFFON', 'DRAGON_MOUNT'].includes(s)) return 'Riding';
          
          // VEHICLE OPERATION - Minecarts, wagons, boats
          if (['MINECART', 'RAIL', 'ROLLER', 'WAGON', 'CART', 'VEHICLE', 'DRIVING', 'OPERATE_VEHICLE', 'PUSH_CART', 'GUIDE_CART', 'BOAT', 'SHIP', 'SAILING', 'NAVIGATE', 'HELM', 'CAPTAIN'].includes(s)) return 'Vehicle Operation';
          
          // SOCIAL ARTS - Persuasion, negotiation, flattery
          if (['PERSUASION', 'NEGOTIATION', 'CONSULT', 'CONSULTING', 'JUDGING_INTENT', 'FLATTERY', 'INTIMIDATION', 'CONVERSATION', 'PACIFY', 'PACIFICATION', 'CONSOLE', 'CONSOLATION', 'LYING', 'DECEPTION', 'INSPIRE', 'INSPIRATION', 'ENTHRALL', 'CHARM', 'CHARISMA', 'ETIQUETTE', 'MANNERS'].includes(s)) return 'Social Arts';
          
          // LEADERSHIP - Command, organization, military leadership
          if (['LEADERSHIP', 'MILITARY_TACTICS', 'TACTICS', 'STRATEGY', 'COMMAND', 'SQUAD_LEAD', 'ORGANIZATION', 'MANAGEMENT', 'COORDINATION', 'CHAIN_OF_COMMAND', 'RANK', 'OFFICER', 'GENERAL', 'CAPTAIN', 'LIEUTENANT', 'SERGEANT', 'CORPORAL'].includes(s)) return 'Leadership';
          
          // SCHOLARSHIP - Knowledge, research, science, observation
          if (['KNOWLEDGE', 'STUDENT', 'RESEARCHER', 'RESEARCH', 'CRITICAL_THINKING', 'LOGIC', 'MATHEMATICS', 'ASTRONOMY', 'CHEMISTRY', 'BIOLOGY', 'GEOGRAPHY', 'MEDICAL_KNOWLEDGE', 'MEDICINE', 'SCHOLAR', 'SCIENCE', 'OBSERVATION', 'ANALYSIS', 'HISTORY', 'ARCHEOLOGY', 'GEOLOGY', 'METEOROLOGY', 'PHYSICS', 'ALCHEMY', 'LIBRARY', 'SCRIVAL_HALL'].includes(s)) return 'Scholarship';
          
          // TEACHING & EDUCATION - Teaching, student, learning
          if (['TEACHING', 'TEACHER', 'INSTRUCTOR', 'PROFESSOR', 'MENTOR', 'APPRENTICE', 'LEARNING', 'EDUCATION', 'SCHOOL', 'ACADEMY', 'UNIVERSITY', 'LECTURE', 'DEMONSTRATION'].includes(s)) return 'Teaching & Education';
          
          // WRITING & RECORDS - Writing, reading, record keeping
          if (['WRITING', 'WRITER', 'READING', 'READER', 'RECORD_KEEPING', 'CLERK', 'SCRIBE', 'COPYIST', 'LITERACY', 'ADMINISTRATION', 'ACCOUNTING', 'LEDGER', 'BOOKKEEPING', 'REGISTRY', 'CENSUS', 'ARCHIVE', 'DOCUMENT'].includes(s)) return 'Writing & Records';
          
          // LITERATURE - Prose, poetry, storytelling
          if (['PROSE', 'POETRY', 'POET', 'STORYTELLING', 'STORYTELLER', 'AUTHOR', 'NOVEL', 'EPIC', 'SAGA', 'LEGEND', 'MYTH', 'FABLE', 'FICTION', 'NONFICTION', 'ESSAY', 'LETTER', 'MANUSCRIPT', 'SCROLL', 'CODEX', 'BOOKBINDING', 'PAPERMAKING', 'INK', 'QUILL'].includes(s)) return 'Literature';
          
          // SPEECH - Speaking, oration, rhetoric
          if (['SPEAKING', 'SPEAKER', 'ORATORY', 'RHETORIC', 'DEBATE', 'ARGUMENT', 'PERSUASIVE_SPEAKING', 'PUBLIC_SPEAKING', 'ELOQUENCE', 'DICTION', 'PRONUNCIATION', 'ACCENT', 'LANGUAGE', 'TRANSLATION', 'INTERPRETATION', 'DIPLOMACY', 'NEGOTIATION'].includes(s)) return 'Speech';
          
          // MUSIC - All music and instruments
          if (['MUSIC', 'MUSICIAN', 'SINGING', 'SINGER', 'PLAY_KEYBOARD', 'PLAY_STRING', 'PLAY_WIND', 'PLAY_PERCUSSION', 'INSTRUMENT', 'COMPOSITION', 'CONDUCTING', 'PERFORMANCE', 'MUSICAL', 'LUTE', 'HARP', 'DRUM', 'FLUTE', 'TRUMPET', 'HARPSICHORD', 'PIANO', 'VIOLIN', 'GUITAR'].includes(s)) return 'Music';
          
          // DANCE - Dancing and choreography
          if (['DANCING', 'DANCER', 'CHOREOGRAPHY', 'BALLET', 'PERFORMANCE_DANCE', 'RITUAL_DANCE', 'SOCIAL_DANCE', 'FOLK_DANCE'].includes(s)) return 'Dance';
          
          // COMEDY & SATIRE - Comedy, jokes, satire
          if (['COMEDY', 'COMEDIAN', 'JOKE', 'HUMOR', 'SATIRE', 'PARODY', 'WIT', 'PUN', 'MIME', 'CLOWN', 'JESTER', 'BUFFOON', 'LIGHT_HEARTED', 'AMUSEMENT', 'ENTERTAINMENT'].includes(s)) return 'Comedy';
          
          // ATHLETICS - Physical activities, sports
          if (['CLIMBING', 'CLIMBER', 'SWIMMING', 'SWIMMER', 'THROW', 'THROWING', 'BALANCE', 'COORDINATION', 'ATHLETICS', 'FITNESS', 'RUNNING', 'JUMPING', 'ACROBATICS', 'TUMBLING', 'SPORT', 'COMPETITION', 'RACE', 'WRESTLING_SPORT', 'BOXING', 'MARTIAL_ARTS', 'FEAT_OF_STRENGTH', 'ENDURANCE'].includes(s)) return 'Athletics';
          
          // AWARENESS - Senses, observation, situational awareness
          if (['SITUATIONAL_AWARENESS', 'KINESIOLOGIC_AWARENESS', 'DIRECTION_SENSE', 'SENSES', 'SIGHT', 'HEARING', 'SMELL', 'TOUCH', 'TASTE', 'INTUITION', 'SIXTH_SENSE', 'PERCEPTION', 'DETECT', 'NOTICE', 'SPOT', 'LISTEN'].includes(s)) return 'Awareness';
          
          // INDUSTRY - Soap, lye, potash, ash, rendering
          if (['SOAP_MAKING', 'LYE_MAKING', 'POTASH_MAKING', 'ASH_PRODUCTION', 'RENDER_FAT', 'POTASH', 'LYE', 'SOAP', 'RENDERING', 'ASH', 'FIRE_MAKING', 'TALLOW', 'FAT', 'OIL', 'LARD', 'GREASE'].includes(s)) return 'Industry';
          
          // MINING & REFINING - Mining specialties, ore processing
          if (['MINING', 'PROSPECTING', 'ORE_PROCESSING', 'ORE_REFINING', 'ORE', 'COAL', 'GEM_MINING', 'METAL_MINING', 'SALT_MINING', 'QUARRY', 'EXCAVATION', 'TUNNELING', 'SHAFT_MINING', 'SURFACE_MINING'].includes(s)) return 'Mining & Refining';
          
          // TRADE & COMMERCE - Merchant, appraisal, valuation
          if (['TRADE', 'TRADING', 'MERCHANT', 'BARGAINING', 'APPRAISAL', 'VALUE', 'PRICE', 'COMMERCE', 'BUSINESS', 'PROFIT', 'MARKET', 'SHOP', 'STORE', 'BUY', 'SELL', 'EXCHANGE', 'IMPORT', 'EXPORT', 'CURRENCY', 'MONEY', 'WEALTH', 'ECONOMY'].includes(s)) return 'Trade & Commerce';
          
          // LAW & ORDER - Judging, law, crime, punishment
          if (['LAW', 'JUDGING', 'JUDGE', 'JUSTICE', 'COURT', 'TRIAL', 'CRIME', 'PUNISHMENT', 'PRISON', 'JAIL', 'EXECUTION', 'LAWYER', 'ATTORNEY', 'PROSECUTOR', 'DEFENDER', 'WITNESS', 'EVIDENCE', 'VERDICT', 'SENTENCE', 'LAW_ENFORCEMENT', 'GUARD', 'WATCH', 'SHERIFF', 'CONSTABLE'].includes(s)) return 'Law & Order';
          
          // THIEVERY - Stealing, pickpocket, lockpicking
          if (['STEALING', 'PICKPOCKET', 'LOCKPICKING', 'BURGLARY', 'ROBBERY', 'THEFT', 'THIEF', 'ROGUE', 'BANDIT', 'CRIMINAL', 'SHOPLIFTING', 'CUTPURSE', 'FILCH', 'POACH', 'POACHING', 'SMUGGLE', 'SMUGGLING', 'CONTRABAND'].includes(s)) return 'Thievery';
          
          // STEALTH - Sneaking, hiding, disguise
          if (['SNEAK', 'SNEAKING', 'STEALTH', 'HIDE', 'HIDING', 'CONCEAL', 'CONCEALMENT', 'CAMOUFLAGE', 'DISGUISE', 'MASK', 'SHADOW', 'SILENT', 'QUIET', 'UNSEEN', 'UNNOTICED'].includes(s)) return 'Stealth';
          
          // TRAPS & TRICKERY - Traps, mechanisms, ambush
          if (['TRAP', 'TRAPS', 'TRAP_ENGINEERING', 'AMBUSH', 'AMBUSHING', 'SNARE', 'PIT_TRAP', 'SPIKE_TRAP', 'CAGE_TRAP', 'STONE_TRAP', 'WEAPON_TRAP', 'PRESSURE_PLATE', 'TRIPWIRE', 'Bait', 'LURE', 'DECOY', 'TRICK', 'DECEPTION', 'RUSE', 'FEINT'].includes(s)) return 'Traps & Trickery';
          
          // SURVIVAL - Foraging, camping, fire, primitive skills
          if (['FORAGE', 'FORAGING', 'CAMPING', 'SHELTER', 'FIRE_BUILDING', 'SURVIVAL', 'WILDERNESS', 'NATURE', 'OUTDOOR', 'PRIMITIVE', 'BUSHCRAFT', 'SCAVENGE', 'SCAVENGING'].includes(s)) return 'Survival';
          
          // GATHERING - Plant gathering, wood collecting
          if (['PLANT_GATHERING', 'HERB_GATHERING', 'GATHER', 'GATHERING', 'COLLECT', 'COLLECTING', 'HARVEST', 'HARVESTING', 'PICKING', 'FETCHING', 'WOOD_COLLECTION', 'BRANCH', 'TWIG', 'PLANT', 'BERRIES', 'FRUIT', 'NUTS', 'MUSHROOM', 'FUNGUS', 'ROOTS', 'HERBS'].includes(s)) return 'Gathering';
          
          // DISSECTION - All dissection skills
          if (['DISSECT', 'DISSECTION', 'ANATOMY', 'VIVISECTION', 'AUTOPSY', 'EXAMINE', 'EXAMINATION', 'STUDY', 'ANALYZE', 'ANALYSIS', 'BUTCHER_ANATOMY', 'SURGERY_PRACTICE'].includes(s)) return 'Dissection';
          
          // VERMIN & PESTS - Vermin handling, pest control
          if (['VERMIN', 'RAT', 'MOUSE', 'HAMSTER', 'RABBIT', 'BIRD_SMALL', 'FISH_SMALL', 'INSECT', 'BUG', 'Pest', 'PEST_CONTROL', 'EXTERMINATE', 'TRAP_VERMIN', 'HUNT_VERMIN', 'CATCH_VERMIN'].includes(s)) return 'Vermin Handling';
          
          // LABOR - Hauling, cleaning, generic labor
          if (['HAULING', 'HAUL', 'CARRY', 'CARRYING', 'TRANSPORT', 'MOVING', 'LIFTING', 'PUSH', 'PULL', 'DRAG', 'CLEANING', 'CLEAN', 'SWEEP', 'MOP', 'WASH', 'POLISH', 'MAINTENANCE', 'LABOR', 'WORK', 'TASK', 'CHORE', 'JOB', 'DUTY', 'SERVICE', 'PEASANT', 'SERF', 'SERVANT'].includes(s)) return 'Labor';
          
          // ECONOMIC - Economy, finance, banking
          if (['ECONOMY', 'FINANCE', 'BANKING', 'INVESTMENT', 'LOAN', 'DEBT', 'CREDIT', 'INTEREST', 'TAX', 'TAXATION', 'REVENUE', 'BUDGET', 'ACCOUNTING', 'BOOKKEEPING'].includes(s)) return 'Economic';
          
          // RELIGION - Worship, prayer, divine
          if (['WORSHIP', 'PRAYER', 'DIVINE', 'RELIGION', 'FAITH', 'BELIEF', 'CLERIC', 'PRIEST', 'PRIESTESS', 'ACOLYTE', 'MONK', 'NUN', 'TEMPLE', 'SHRINE', 'CHURCH', 'CATHEDRAL', 'RITUAL', 'CEREMONY', 'SACRAMENT', 'BLESSING', 'CURSE', 'DIVINATION', 'PROPHECY', 'OMEN', 'VISION', 'REVELATION', 'COMMUNE', 'SPIRIT', 'SOUL', 'AFTERLIFE', 'HELL', 'HEAVEN', 'UNDERWORLD'].includes(s)) return 'Religion';
          
          // MAGIC - Arcane, spells, magical arts
          if (['MAGIC', 'SPELL', 'ARCANE', 'SORCERY', 'WIZARDRY', 'WITCHCRAFT', 'WIZARD', 'SORCERER', 'WITCH', 'MAGE', 'MAGUS', 'ENCHANTER', 'ENCHANTMENT', 'CHARM', 'SPELLCASTING', 'MANA', 'MAGICAL', 'SUPERNATURAL', 'NECROMANCY', 'ELEMENTAL', 'SUMMONING', 'CONJURATION', 'ILLUSION', 'TRANSMUTATION', 'ABJURATION', 'DIVINATION_MAGIC', 'ENCHANTMENT_MAGIC', 'EVOCATION', 'NECROMANTIC'].includes(s)) return 'Magic';
          
          // NATURE & DRUIDISM - Nature connection, druidic arts
          if (['DRUID', 'DRUIDISM', 'NATURE', 'NATURAL', 'EARTH', 'WATER', 'FIRE', 'AIR', 'PLANT', 'ANIMAL', 'WEATHER', 'SEASON', 'MOON', 'SUN', 'STARS', 'COSMOS', 'HARMONY', 'BALANCE', 'CIRCLE', 'STONE_CIRCLE', 'SACRED_GROVE'].includes(s)) return 'Nature & Druidism';
          
          // MENTAL - Willpower, focus, mental discipline
          if (['WILLPOWER', 'FOCUS', 'CONCENTRATION', 'DISCIPLINE', 'MEDITATION', 'MIND', 'MENTAL', 'PSYCHIC', 'TELEPATHY', 'TELEKINESIS', 'CLAIRVOYANCE', 'PRECOGNITION', 'ASTRAL', 'MEDITATE', 'ZEN', 'TRANCE', 'ALTERED_STATE'].includes(s)) return 'Mental Discipline';
          
          // MEMORY & KNOWLEDGE - Memory, recall, learning
          if (['MEMORY', 'RECALL', 'REMEMBER', 'MEMORIZE', 'LEARNING', 'STUDY', 'KNOWLEDGE_ACQUISITION', 'EDUCATION', 'TRAINING', 'PRACTICE', 'REPETITION', 'DRILL', 'EXERCISE', 'SKILL_GAIN', 'IMPROVEMENT', 'MASTERY', 'EXPERTISE', 'PROFICIENCY', 'COMPETENCE', 'APTITUDE', 'TALENT', 'GIFT', 'KNACK'].includes(s)) return 'Memory & Learning';
          
          // PATIENCE & TEMPERAMENT - Patience, calm, emotional control
          if (['PATIENCE', 'CALM', 'COMPOSURE', 'TEMPERAMENT', 'EMOTION', 'FEELING', 'MOOD', 'TEMPER', 'SELF_CONTROL', 'RESTRAINT', 'MODERATION', 'EQUANIMITY', 'SERENITY', 'TRANQUILITY', 'PEACE', 'HARMONY_INNER', 'BALANCE_INNER', 'CENTERED', 'GROUNDED'].includes(s)) return 'Patience & Temperament';
          
          // MISCELLANEOUS - Last resort catch-all
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
        const categoryOrder = ['Warfare', 'Metalworking', 'Gem Working', 'Stoneworking', 'Woodworking', 'Fiber & Leather', 'Pottery & Glass', 'Organic Crafts', 'Construction', 'Engineering', 'Healing', 'Agriculture', 'Food Preparation', 'Animal Care', 'Animal Products', 'Hunting & Trapping', 'Fishing', 'Riding', 'Vehicle Operation', 'Leadership', 'Social Arts', 'Scholarship', 'Teaching & Education', 'Writing & Records', 'Literature', 'Speech', 'Music', 'Dance', 'Comedy', 'Athletics', 'Awareness', 'Industry', 'Mining & Refining', 'Trade & Commerce', 'Law & Order', 'Thievery', 'Stealth', 'Traps & Trickery', 'Survival', 'Gathering', 'Dissection', 'Vermin Handling', 'Labor', 'Economic', 'Religion', 'Magic', 'Nature & Druidism', 'Mental Discipline', 'Memory & Learning', 'Patience & Temperament', 'Miscellaneous'];
        
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
