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
    'Stone & Gems': 'Stone Sage',
    'Woodworking': 'Wood Sage',
    'Crafting': 'Artisan Supreme',
    'Construction & Engineering': 'High Builder',
    'Healing': 'Grand Healer',
    'Agriculture & Food': 'Harvest Sovereign',
    'Animal Arts': 'Beastmaster',
    'Leadership': 'High Commander',
    'Social Arts': 'Grand Diplomat',
    'Scholarship': 'Sage',
    'Performing Arts': 'Virtuoso',
    'Athletics': 'Champion',
    'Industry': 'Production Chief',
    'Trade & Law': 'Trade Prince',
    'Survival': 'Wilderness Guide',
    'Labor': 'Foreman',
    'Supernatural': 'Archmage'
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
        
        // Skill category mapping - CONSOLIDATED: no "Other", all groups have 2+ items
        const getSkillCategory = (skill: string): string => {
          const s = skill.toUpperCase();
          
          // WARFARE - Weapons, armor, combat (NO leadership/teaching/discipline)
          if (['SWORD', 'SWORDS', 'SWORDSMANSHIP', 'SWORDSMAN', 'AXE', 'AXEMAN', 'AXEMANSHIP', 'MACE', 'MACEMAN', 'MACEMANSHIP', 'HAMMER', 'HAMMERMAN', 'HAMMERMANSHIP', 'SPEAR', 'SPEARMAN', 'SPEARMANSHIP', 'PIKE', 'PIKEMAN', 'PIKEMANSHIP', 'CROSSBOW', 'CROSSBOWMAN', 'BOW', 'BOWMAN', 'BOWYER', 'DAGGER', 'KNIFE', 'WHIP', 'SCOURGE', 'BLOWGUN', 'BLOW_GUN', 'BLOWGUNMAN', 'MSWORD', 'MACE_WEAPON', 'MWEAPON', 'WEAPON_MASTER', 'MSC_WEAPON', 'ARMOR', 'ARMOR_USER', 'SHIELD', 'SHIELD_USER', 'DODGE', 'DODGING', 'WRESTLE', 'WRESTLING', 'BITE', 'GRASP', 'GRASP_STRIKE', 'STANCE', 'STANCE_STRIKE', 'MELEE', 'MELEE_COMBAT', 'RANGED', 'RANGED_COMBAT', 'THROW', 'THROWING', 'SIEGE', 'SIEGEOPERATE', 'SIEGE_OPERATE', 'SIEGE_ENGINEERING', 'SIEGE_ENGINEER', 'BALLISTA', 'CATAPULT', 'COMBAT', 'WAR', 'FIGHTING', 'PARRY', 'BLOCK', 'KICK', 'PUNCH', 'STRIKE', 'BATTLE', 'WARFARE', 'FIGHTER', 'WARRIOR', 'SOLDIER', 'KNIGHT', 'DUEL', 'DUELIST'].includes(s)) return 'Warfare';
          
          // METALWORKING - Smithing, smelting, forging
          if (['WEAPONSMITH', 'WEAPONSMITHING', 'ARMORSMITH', 'ARMORSMITHING', 'BLACKSMITH', 'BLACKSMITHING', 'METALCRAFT', 'SMELT', 'SMELTING', 'FORGE_WEAPON', 'FORGE_ARMOR', 'FORGE_FURNITURE', 'EXTRACT_STRAND', 'STRAND_EXTRACT', 'METALLURGY', 'FURNACE_OPERATING', 'FORGE', 'METAL_WORKING', 'IRON_WORKING', 'STEEL_MAKING', 'ALLOY'].includes(s)) return 'Metalworking';
          
          // STONE & GEMS - Stone crafts, masonry, gems, engraving
          if (['STONECRAFT', 'DETAILSTONE', 'DETAIL_STONE', 'STONE_CARVE', 'STONE_CARVING', 'ENCASEFORTIFICATION', 'ENCASE_FORTIFICATION', 'CONSOLEFORTIFICATION', 'CONSOLE_FORTIFICATION', 'MASONRY', 'STONE', 'ROCK_CRAFT', 'STONE_DRESSING', 'STONE_DETAILING', 'CUTGEM', 'CUT_GEM', 'ENCRUSTGEM', 'ENCRUST_GEM', 'GEM_CUTTING', 'GEM_SETTING', 'GEM_ENCRUSTING', 'JEWELER', 'JEWELRY', 'GEMS', 'GEM_CRAFT', 'ROUGH_GEM', 'GEMSTONE', 'ENGRAVE_STONE', 'STONE_ENGRAVING', 'ENGRAVE', 'ENGRAVING'].includes(s)) return 'Stone & Gems';
          
          // WOODWORKING - Carpentry, wood crafts, cutting
          if (['CARPENTRY', 'WOODCRAFT', 'WOOD_CARVE', 'WOOD_CARVING', 'WOODCUTTING', 'WOOD_CUTTING', 'FORESTRY', 'LUMBER', 'LUMBERJACK', 'WOODSMAN', 'FURNITURE', 'WOODWORK', 'WOOD_SHAPING', 'TIMBER', 'LOG', 'TREE_FELLING'].includes(s)) return 'Woodworking';
          
          // CRAFTING - Leather, cloth, weaving, pottery, glass, bone, ivory
          if (['LEATHERWORK', 'LEATHERWORKING', 'CLOTHESMAKING', 'TANNING', 'TANNER', 'DYER', 'DYEING', 'WEAVING', 'SPINNING', 'CLOTH', 'TAILOR', 'SEWING', 'KNITTING', 'EMBROIDERY', 'LEATHER_CRAFT', 'CLOTH_CRAFT', 'POTTERY', 'GLASSMAKER', 'GLASSMAKING', 'GLAZING', 'CERAMICS', 'KILN', 'CLAY', 'GLASS_CRAFT', 'PORCELAIN', 'BONE_CARVE', 'BONE_CARVING', 'IVORY_CARVE', 'IVORY_CARVING', 'SHELL_CRAFT', 'HORN_CRAFT', 'PEARL_CRAFT', 'CORAL_CRAFT', 'SHELL', 'BONE', 'IVORY', 'HORN', 'PEARL', 'HORN_WORKING', 'SHELL_WORKING'].includes(s)) return 'Crafting';
          
          // CONSTRUCTION & ENGINEERING - Mining, building, mechanics, traps
          if (['MINING', 'ARCHITECTURE', 'ARCHITECT', 'DESIGNBUILDING', 'DESIGN_BUILDING', 'MECHANICS', 'MECHANIC', 'OPERATE_PUMP', 'PUMP_OPERATION', 'PUMP', 'CONSTRUCTION', 'BUILDING', 'WALL', 'FLOOR', 'ROOF', 'SUPPORT', 'CHANNEL', 'RAMP', 'STAIR', 'FORTIFICATION', 'BRIDGE', 'ROAD', 'WELL', 'TRAP_ENGINEERING', 'TRAP_COMPONENT', 'LINK', 'MECHANISM', 'GEAR_ASSEMBLY', 'AXLE', 'WATER_WHEEL', 'WINDMILL', 'SCREW_PUMP', 'PISTON', 'LEVER', 'PRESSURE_PLATE', 'CAGE_TRAP', 'STONE_TRAP', 'WEAPON_TRAP', 'SPIKE', 'SERRATED_DISC', 'MENACING_SPIKE', 'GIANT_AXE', 'ENORMOUS_CORKSCREW', 'MINECART', 'RAIL', 'ROLLER', 'WAGON', 'CART', 'VEHICLE', 'DRIVING', 'OPERATE_VEHICLE', 'PUSH_CART', 'GUIDE_CART', 'BOAT', 'SHIP', 'SAILING', 'NAVIGATE', 'HELM', 'CAPTAIN', 'NAVIGATION', 'CARTOGRAPHY'].includes(s)) return 'Construction & Engineering';
          
          // HEALING - All medical skills
          if (['DIAGNOSE', 'DIAGNOSIS', 'SURGERY', 'SURGEON', 'SET_BONE', 'SET_BONES', 'SUTURE', 'SUTURING', 'DRESS_WOUNDS', 'DRESSING_WOUNDS', 'WOUND_DRESSING', 'CRUTCH_WALK', 'CRUTCH_WALKING', 'PHYSICIAN', 'DOCTOR', 'MEDIC', 'FIRST_AID', 'BANDAGE', 'SPLINT', 'CAST', 'MEDICAL_PRACTICE', 'HEALING', 'TREATMENT', 'CARE_GIVER', 'NURSE', 'NURSING'].includes(s)) return 'Healing';
          
          // AGRICULTURE & FOOD - Farming, plants, brewing, cooking, butchery, gelding
          if (['GROWING', 'PLANT', 'PLANTS', 'HERBALISM', 'HERBALIST', 'FARMING', 'FARMING_FIELD', 'MILLING', 'PROCESSPLANTS', 'PROCESS_PLANTS', 'BREWING', 'COOKING', 'CHEESEMAKING', 'PRESSING', 'BEEKEEPING', 'BEE_KEEPING', 'WAX_WORKING', 'GARDENING', 'CULTIVATION', 'THRESHING', 'QUERN', 'MILLSTONE', 'PLANT_PROCESSING', 'BUTCHER', 'BUTCHERING', 'CLEAN', 'CLEANING', 'GUT', 'GUTTING', 'PREPARE_MEAL', 'MEAL_PREPARATION', 'KITCHEN', 'COOK', 'CHEF', 'BAKING', 'SLAUGHTER', 'MEAT_CRAFT', 'FAT_RENDERING', 'RENDER_FAT', 'TALLOW', 'GELD', 'GELDING', 'CASTRATE', 'CASTRATION'].includes(s)) return 'Agriculture & Food';
          
          // ANIMAL ARTS - Animals, training, riding, hunting, fishing, products, dissection
          if (['ANIMALCARE', 'ANIMAL_CARE', 'ANIMALTRAIN', 'ANIMAL_TRAIN', 'TRAIN_ANIMALS', 'TAME', 'TAMING', 'TRAINING', 'PET', 'WAR_TRAIN', 'HUNT_TRAIN', 'KENNEL', 'PASTURE', 'ZOO', 'WAR_ANIMAL', 'HUNTING_ANIMAL', 'GUARD_ANIMAL', 'MILK', 'MILKING', 'SHEAR', 'SHEARER', 'SHEARING', 'POULTRY', 'POULTRY_KEEPING', 'EGG', 'EGG_COLLECTION', 'HONEY', 'HONEY_COLLECTING', 'WAX', 'BEESWAX', 'SILK', 'SHEEP', 'GOAT', 'COW', 'YAK', 'ALPACA', 'RIDING', 'RIDER', 'MOUNT', 'MOUNTED_COMBAT', 'CAVALRY', 'HORSE', 'CAMEL', 'ELEPHANT', 'HUNTING', 'HUNTER', 'TRAPPING', 'SNEAK', 'SNEAKING', 'AMBUSH', 'AMBUSHING', 'STALK', 'STALKING', 'TRACK', 'TRACKING', 'CAGE_TRAP', 'ANIMAL_TRAP', 'LEASH', 'RESTRAINT', 'GAME_KEEPING', 'WILDLIFE', 'FISH', 'FISHING', 'CLEAN_FISH', 'FISH_CLEANING', 'DISSECT_FISH', 'FISH_DISSECTION', 'FISHERMAN', 'FISHERY', 'AQUACULTURE', 'NET', 'ROD', 'LINE_FISHING', 'DISSECT_VERMIN', 'VERMIN_DISSECTION', 'ANIMAL_DISSECT', 'ANIMAL_DISSECTION'].includes(s)) return 'Animal Arts';
          
          // LEADERSHIP - Command, teaching, discipline, organization, tactics
          if (['LEADERSHIP', 'TEACHING', 'TEACHER', 'INSTRUCTOR', 'PROFESSOR', 'MENTOR', 'APPRENTICE', 'LEARNING', 'EDUCATION', 'SCHOOL', 'ACADEMY', 'UNIVERSITY', 'LECTURE', 'DEMONSTRATION', 'DISCIPLINE', 'MILITARY_TACTICS', 'TACTICS', 'STRATEGY', 'COMMAND', 'SQUAD_LEAD', 'ORGANIZATION', 'MANAGEMENT', 'COORDINATION', 'CHAIN_OF_COMMAND', 'RANK', 'OFFICER', 'GENERAL', 'CAPTAIN', 'LIEUTENANT', 'SERGEANT', 'CORPORAL', 'BOSS', 'CHIEF', 'HEAD', 'LEADER', 'DIRECTOR', 'SUPERVISOR', 'OVERSEER', 'MANAGER'].includes(s)) return 'Leadership';
          
          // SOCIAL ARTS - Persuasion, speech, comedy, flattery, awareness, conversation, intrigue
          if (['PERSUASION', 'NEGOTIATION', 'CONSULT', 'CONSULTING', 'JUDGING_INTENT', 'FLATTERY', 'INTIMIDATION', 'CONVERSATION', 'PACIFY', 'PACIFICATION', 'CONSOLE', 'CONSOLATION', 'LYING', 'DECEPTION', 'INSPIRE', 'INSPIRATION', 'ENTHRALL', 'CHARM', 'CHARISMA', 'ETIQUETTE', 'MANNERS', 'SPEAKING', 'SPEAKER', 'ORATORY', 'RHETORIC', 'DEBATE', 'ARGUMENT', 'PERSUASIVE_SPEAKING', 'PUBLIC_SPEAKING', 'ELOQUENCE', 'DICTION', 'PRONUNCIATION', 'ACCENT', 'LANGUAGE', 'TRANSLATION', 'INTERPRETATION', 'DIPLOMACY', 'COMEDY', 'COMEDIAN', 'JOKE', 'HUMOR', 'SATIRE', 'PARODY', 'WIT', 'PUN', 'MIME', 'CLOWN', 'JESTER', 'BUFFOON', 'LIGHT_HEARTED', 'AMUSEMENT', 'ENTERTAINMENT', 'SITUATIONAL_AWARENESS', 'KINESIOLOGIC_AWARENESS', 'AWARENESS', 'EMPATHY', 'SOCIAL', 'SOCIALIZE', 'NETWORK', 'CONNECT', 'RELATE', 'BOND', 'FRIENDSHIP', 'ROMANCE', 'COURTSHIP', 'LOVE', 'ATTRACTION', 'INTRIGUE', 'SCHEME', 'PLOT', 'CONSPIRE', 'CONSPIRACY', 'MANIPULATE', 'MANIPULATION', 'GUILE', 'CUNNING', 'SCHMooze'].includes(s)) return 'Social Arts';
          
          // SCHOLARSHIP - Knowledge, research, writing, literature, science, appraisal
          if (['KNOWLEDGE', 'STUDENT', 'RESEARCHER', 'RESEARCH', 'CRITICAL_THINKING', 'LOGIC', 'MATHEMATICS', 'ASTRONOMY', 'CHEMISTRY', 'BIOLOGY', 'GEOGRAPHY', 'MEDICAL_KNOWLEDGE', 'MEDICINE', 'SCHOLAR', 'SCIENCE', 'OBSERVATION', 'ANALYSIS', 'HISTORY', 'ARCHEOLOGY', 'GEOLOGY', 'METEOROLOGY', 'PHYSICS', 'ALCHEMY', 'LIBRARY', 'SCRIVAL_HALL', 'WRITING', 'WRITER', 'READING', 'READER', 'RECORD_KEEPING', 'CLERK', 'SCRIBE', 'COPYIST', 'LITERACY', 'ADMINISTRATION', 'ACCOUNTING', 'LEDGER', 'BOOKKEEPING', 'REGISTRY', 'CENSUS', 'ARCHIVE', 'DOCUMENT', 'PROSE', 'POETRY', 'POET', 'STORYTELLING', 'STORYTELLER', 'AUTHOR', 'NOVEL', 'EPIC', 'SAGA', 'LEGEND', 'MYTH', 'FABLE', 'FICTION', 'NONFICTION', 'ESSAY', 'LETTER', 'MANUSCRIPT', 'SCROLL', 'CODEX', 'BOOKBINDING', 'PAPERMAKING', 'INK', 'QUILL', 'APPRAISAL', 'APPRAISE', 'EVALUATE', 'ASSESS', 'KNOWLEDGE_ACQUISITION', 'KNOWLEDGE_GAIN', 'LEARN'].includes(s)) return 'Scholarship';
          
          // PERFORMING ARTS - Music, singing, dance, instruments
          if (['MUSIC', 'MUSICIAN', 'SINGING', 'SINGER', 'PLAY_KEYBOARD', 'PLAY_STRING', 'PLAY_WIND', 'PLAY_PERCUSSION', 'INSTRUMENT', 'COMPOSITION', 'CONDUCTING', 'PERFORMANCE', 'MUSICAL', 'LUTE', 'HARP', 'DRUM', 'FLUTE', 'TRUMPET', 'HARPSICHORD', 'PIANO', 'VIOLIN', 'GUITAR', 'DANCING', 'DANCER', 'CHOREOGRAPHY', 'BALLET', 'PERFORMANCE_DANCE', 'RITUAL_DANCE', 'SOCIAL_DANCE', 'FOLK_DANCE', 'ACTING', 'ACTOR', 'DRAMA', 'THEATER', 'STAGE', 'PLAY', 'OPERA', 'RECITAL', 'CONCERT'].includes(s)) return 'Performing Arts';
          
          // ATHLETICS - Physical activities, sports, swimming, climbing, senses
          if (['CLIMBING', 'CLIMBER', 'SWIMMING', 'SWIMMER', 'THROW', 'THROWING', 'BALANCE', 'COORDINATION', 'ATHLETICS', 'FITNESS', 'RUNNING', 'JUMPING', 'ACROBATICS', 'TUMBLING', 'SPORT', 'COMPETITION', 'RACE', 'WRESTLING_SPORT', 'BOXING', 'MARTIAL_ARTS', 'FEAT_OF_STRENGTH', 'ENDURANCE', 'DIRECTION_SENSE', 'SENSES', 'SIGHT', 'HEARING', 'SMELL', 'TOUCH', 'TASTE', 'INTUITION', 'SIXTH_SENSE', 'PERCEPTION', 'DETECT', 'NOTICE', 'SPOT', 'LISTEN', 'AGILITY', 'DEXTERITY', 'STRENGTH', 'SPEED', 'STAMINA'].includes(s)) return 'Athletics';
          
          // INDUSTRY - Soap, lye, potash, mining, ore, boats
          if (['SOAP_MAKING', 'LYE_MAKING', 'POTASH_MAKING', 'ASH_PRODUCTION', 'RENDER_FAT', 'POTASH', 'LYE', 'SOAP', 'RENDERING', 'ASH', 'FIRE_MAKING', 'TALLOW', 'FAT', 'OIL', 'LARD', 'GREASE', 'PROSPECTING', 'ORE_PROCESSING', 'ORE_REFINING', 'ORE', 'COAL', 'GEM_MINING', 'METAL_MINING', 'SALT_MINING', 'QUARRY', 'EXCAVATION', 'TUNNELING', 'SHAFT_MINING', 'SURFACE_MINING'].includes(s)) return 'Industry';
          
          // TRADE & LAW - Merchant, trading, crime, law, stealth
          if (['TRADE', 'TRADING', 'MERCHANT', 'BARGAINING', 'VALUE', 'PRICE', 'COMMERCE', 'BUSINESS', 'PROFIT', 'MARKET', 'SHOP', 'STORE', 'BUY', 'SELL', 'EXCHANGE', 'IMPORT', 'EXPORT', 'CURRENCY', 'MONEY', 'WEALTH', 'ECONOMY', 'FINANCE', 'BANKING', 'INVESTMENT', 'LOAN', 'DEBT', 'CREDIT', 'INTEREST', 'TAX', 'TAXATION', 'REVENUE', 'BUDGET', 'ACCOUNTING', 'BOOKKEEPING', 'LAW', 'JUDGING', 'JUDGE', 'JUSTICE', 'COURT', 'TRIAL', 'CRIME', 'PUNISHMENT', 'PRISON', 'JAIL', 'EXECUTION', 'LAWYER', 'ATTORNEY', 'PROSECUTOR', 'DEFENDER', 'WITNESS', 'EVIDENCE', 'VERDICT', 'SENTENCE', 'LAW_ENFORCEMENT', 'GUARD', 'WATCH', 'SHERIFF', 'CONSTABLE', 'STEALING', 'PICKPOCKET', 'LOCKPICKING', 'BURGLARY', 'ROBBERY', 'THEFT', 'THIEF', 'ROGUE', 'BANDIT', 'CRIMINAL', 'SHOPLIFTING', 'CUTPURSE', 'FILCH', 'POACH', 'POACHING', 'SMUGGLE', 'SMUGGLING', 'CONTRABAND', 'SNEAK', 'SNEAKING', 'STEALTH', 'HIDE', 'HIDING', 'CONCEAL', 'CONCEALMENT', 'CAMOUFLAGE', 'DISGUISE', 'MASK', 'SHADOW', 'SILENT', 'QUIET', 'UNSEEN', 'UNNOTICED', 'TRAP', 'TRAPS', 'AMBUSH', 'AMBUSHING', 'SNARE', 'PIT_TRAP', 'SPIKE_TRAP', 'PRESSURE_PLATE', 'TRIPWIRE', 'Bait', 'LURE', 'DECOY', 'TRICK', 'DECEPTION', 'RUSE', 'FEINT'].includes(s)) return 'Trade & Law';
          
          // SURVIVAL - Foraging, camping, fire, gathering, vermin (NO dissection)
          if (['FORAGE', 'FORAGING', 'CAMPING', 'SHELTER', 'FIRE_BUILDING', 'SURVIVAL', 'WILDERNESS', 'NATURE', 'OUTDOOR', 'PRIMITIVE', 'BUSHCRAFT', 'SCAVENGE', 'SCAVENGING', 'PLANT_GATHERING', 'HERB_GATHERING', 'GATHER', 'GATHERING', 'COLLECT', 'COLLECTING', 'HARVEST', 'HARVESTING', 'PICKING', 'FETCHING', 'WOOD_COLLECTION', 'BRANCH', 'TWIG', 'BERRIES', 'FRUIT', 'NUTS', 'MUSHROOM', 'FUNGUS', 'ROOTS', 'HERBS', 'VERMIN', 'RAT', 'MOUSE', 'HAMSTER', 'RABBIT', 'BIRD_SMALL', 'FISH_SMALL', 'INSECT', 'BUG', 'PEST', 'PEST_CONTROL', 'EXTERMINATE', 'TRAP_VERMIN', 'HUNT_VERMIN', 'CATCH_VERMIN'].includes(s)) return 'Survival';
          
          // LABOR - Hauling, cleaning, generic work
          if (['HAULING', 'HAUL', 'CARRY', 'CARRYING', 'TRANSPORT', 'MOVING', 'LIFTING', 'PUSH', 'PULL', 'DRAG', 'CLEANING', 'CLEAN', 'SWEEP', 'MOP', 'WASH', 'POLISH', 'MAINTENANCE', 'LABOR', 'WORK', 'TASK', 'CHORE', 'JOB', 'DUTY', 'SERVICE', 'PEASANT', 'SERF', 'SERVANT', 'LAUNDERING', 'HELP', 'AID', 'ASSIST', 'SUPPORT_WORK'].includes(s)) return 'Labor';
          
          // SUPERNATURAL - Religion, magic, mental, nature, druidism, memory, patience
          if (['WORSHIP', 'PRAYER', 'DIVINE', 'RELIGION', 'FAITH', 'BELIEF', 'CLERIC', 'PRIEST', 'PRIESTESS', 'ACOLYTE', 'MONK', 'NUN', 'TEMPLE', 'SHRINE', 'CHURCH', 'CATHEDRAL', 'RITUAL', 'CEREMONY', 'SACRAMENT', 'BLESSING', 'CURSE', 'DIVINATION', 'PROPHECY', 'OMEN', 'VISION', 'REVELATION', 'COMMUNE', 'SPIRIT', 'SOUL', 'AFTERLIFE', 'HELL', 'HEAVEN', 'UNDERWORLD', 'MAGIC', 'SPELL', 'ARCANE', 'SORCERY', 'WIZARDRY', 'WITCHCRAFT', 'WIZARD', 'SORCERER', 'WITCH', 'MAGE', 'MAGUS', 'ENCHANTER', 'ENCHANTMENT', 'CHARM_MAGIC', 'SPELLCASTING', 'MANA', 'MAGICAL', 'SUPERNATURAL', 'NECROMANCY', 'ELEMENTAL', 'SUMMONING', 'CONJURATION', 'ILLUSION', 'TRANSMUTATION', 'ABJURATION', 'DIVINATION_MAGIC', 'ENCHANTMENT_MAGIC', 'EVOCATION', 'NECROMANTIC', 'DRUID', 'DRUIDISM', 'NATURAL', 'EARTH', 'WATER', 'FIRE', 'AIR', 'WEATHER', 'SEASON', 'MOON', 'SUN', 'STARS', 'COSMOS', 'HARMONY', 'BALANCE', 'CIRCLE', 'STONE_CIRCLE', 'SACRED_GROVE', 'WILLPOWER', 'FOCUS', 'CONCENTRATION', 'MEDITATION', 'MIND', 'MENTAL', 'PSYCHIC', 'TELEPATHY', 'TELEKINESIS', 'CLAIRVOYANCE', 'PRECOGNITION', 'ASTRAL', 'MEDITATE', 'ZEN', 'TRANCE', 'ALTERED_STATE', 'MEMORY', 'RECALL', 'REMEMBER', 'MEMORIZE', 'LEARNING', 'STUDY', 'KNOWLEDGE_ACQUISITION', 'TRAINING', 'PRACTICE', 'REPETITION', 'DRILL', 'EXERCISE', 'SKILL_GAIN', 'IMPROVEMENT', 'MASTERY', 'EXPERTISE', 'PROFICIENCY', 'COMPETENCE', 'APTITUDE', 'TALENT', 'GIFT', 'KNACK', 'PATIENCE', 'CALM', 'COMPOSURE', 'TEMPERAMENT', 'EMOTION', 'FEELING', 'MOOD', 'TEMPER', 'SELF_CONTROL', 'RESTRAINT', 'MODERATION', 'EQUANIMITY', 'SERENITY', 'TRANQUILITY', 'PEACE', 'HARMONY_INNER', 'BALANCE_INNER', 'CENTERED', 'GROUNDED'].includes(s)) return 'Supernatural';
          
          // Last resort keyword matching
          if (s.includes('WEAPON') || s.includes('SWORD') || s.includes('AXE') || s.includes('MACE') || s.includes('HAMMER') || s.includes('SPEAR') || s.includes('BOW') || s.includes('DAGGER') || s.includes('KNIFE') || s.includes('ARMOR') || s.includes('SHIELD') || s.includes('DODGE') || s.includes('WRESTLE') || s.includes('COMBAT') || s.includes('WAR')) return 'Warfare';
          if (s.includes('SMITH') || s.includes('FORGE') || s.includes('SMELT') || s.includes('METAL')) return 'Metalworking';
          if (s.includes('STONE') || s.includes('MASON') || s.includes('GEM') || s.includes('ENCRUST') || s.includes('ENGRAVE')) return 'Stone & Gems';
          if (s.includes('WOOD') || s.includes('CARPENT') || s.includes('LUMBER')) return 'Woodworking';
          if (s.includes('LEATHER') || s.includes('CLOTH') || s.includes('WEAVE') || s.includes('TAILOR') || s.includes('SEW') || s.includes('GLASS') || s.includes('POTTER') || s.includes('BONE') || s.includes('IVORY') || s.includes('SHELL') || s.includes('HORN')) return 'Crafting';
          if (s.includes('MINE') || s.includes('BUILD') || s.includes('CONSTRUCT') || s.includes('ARCHITECT') || s.includes('MECHANIC') || s.includes('TRAP') || s.includes('PUMP') || s.includes('ENGINEER') || s.includes('CART') || s.includes('WAGON') || s.includes('BOAT') || s.includes('SHIP')) return 'Construction & Engineering';
          if (s.includes('HEAL') || s.includes('DOCTOR') || s.includes('MEDIC') || s.includes('SURGERY') || s.includes('DIAGNOS') || s.includes('BANDAGE') || s.includes('WOUND')) return 'Healing';
          if (s.includes('FARM') || s.includes('PLANT') || s.includes('GROW') || s.includes('BREW') || s.includes('COOK') || s.includes('CHEESE') || s.includes('BUTCHER') || s.includes('GELD') || s.includes('MEAL') || s.includes('KITCHEN')) return 'Agriculture & Food';
          if (s.includes('ANIMAL') || s.includes('RIDING') || s.includes('HUNT') || s.includes('FISH') || s.includes('MILK') || s.includes('SHEAR') || s.includes('TAME') || s.includes('PET') || s.includes('KENNEL') || s.includes('POULTRY') || s.includes('HONEY') || s.includes('DISSECT') || s.includes('DISSECTION')) return 'Animal Arts';
          if (s.includes('TEACH') || s.includes('LEAD') || s.includes('DISCIPLINE') || s.includes('COMMAND') || s.includes('MANAGE') || s.includes('BOSS') || s.includes('MENTOR') || s.includes('EDUCAT')) return 'Leadership';
          if (s.includes('SOCIAL') || s.includes('SPEECH') || s.includes('SPEAK') || s.includes('TALK') || s.includes('CONVERS') || s.includes('CHARM') || s.includes('COMEDY') || s.includes('JOKE') || s.includes('FLATTER') || s.includes('PERSUADE') || s.includes('AWARE') || s.includes('EMPATH')) return 'Social Arts';
          if (s.includes('WRITE') || s.includes('READ') || s.includes('BOOK') || s.includes('SCRIBE') || s.includes('RECORD') || s.includes('POEM') || s.includes('STORY') || s.includes('RESEARCH') || s.includes('KNOWLEDGE') || s.includes('SCIENCE') || s.includes('SCHOLAR') || s.includes('LETTER') || s.includes('AUTHOR') || s.includes('APPRAIS')) return 'Scholarship';
          if (s.includes('MUSIC') || s.includes('SING') || s.includes('DANCE') || s.includes('PLAY_') || s.includes('INSTRUMENT') || s.includes('PERFORM') || s.includes('SONG') || s.includes('LYRE') || s.includes('RECITAL')) return 'Performing Arts';
          if (s.includes('CLIMB') || s.includes('SWIM') || s.includes('ATHLETIC') || s.includes('SPORT') || s.includes('RUN') || s.includes('JUMP') || s.includes('SENSE') || s.includes('PERCEPT') || s.includes('STRENGTH')) return 'Athletics';
          if (s.includes('SOAP') || s.includes('LYE') || s.includes('POTASH') || s.includes('ASH') || s.includes('RENDER') || s.includes('TALLOW') || s.includes('PROSPECT') || s.includes('ORE') || s.includes('MINING')) return 'Industry';
          if (s.includes('TRADE') || s.includes('MERCHANT') || s.includes('APPRAIS') || s.includes('VALUE') || s.includes('COMMERCE') || s.includes('ECONOM') || s.includes('FINANCE') || s.includes('LAW') || s.includes('JUDGE') || s.includes('CRIME') || s.includes('STEAL') || s.includes('THIEF') || s.includes('ROB') || s.includes('PICKPOCKET') || s.includes('LOCKPICK') || s.includes('SNEAK') || s.includes('STEALTH') || s.includes('HIDE') || s.includes('DISGUISE') || s.includes('AMBUSH') || s.includes('TRAP')) return 'Trade & Law';
          if (s.includes('FORAGE') || s.includes('GATHER') || s.includes('CAMP') || s.includes('SURVIV') || s.includes('WILDER') || s.includes('VERMIN') || s.includes('PEST') || s.includes('FIRE_BUILD')) return 'Survival';
          if (s.includes('HAUL') || s.includes('CLEAN') || s.includes('LABOR') || s.includes('WORK') || s.includes('JOB') || s.includes('LAUNDR') || s.includes('CARRY') || s.includes('TRANSPORT')) return 'Labor';
          if (s.includes('MAGIC') || s.includes('SPELL') || s.includes('WIZARD') || s.includes('WITCH') || s.includes('PRIEST') || s.includes('DIVINE') || s.includes('RELIGION') || s.includes('WORSHIP') || s.includes('PRAYER') || s.includes('DRUID') || s.includes('NATURE') || s.includes('MENTAL') || s.includes('MIND') || s.includes('WILL') || s.includes('FOCUS') || s.includes('MEDITAT') || s.includes('MEMORY') || s.includes('PATIENCE') || s.includes('CALM') || s.includes('SPIRIT') || s.includes('SUPERNATURAL') || s.includes('ARCANE')) return 'Supernatural';
          
          // Absolute last resort - generic work
          return 'Labor';
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
        const categoryOrder = ['Warfare', 'Metalworking', 'Stone & Gems', 'Woodworking', 'Crafting', 'Construction & Engineering', 'Healing', 'Agriculture & Food', 'Animal Arts', 'Leadership', 'Social Arts', 'Scholarship', 'Performing Arts', 'Athletics', 'Industry', 'Trade & Law', 'Survival', 'Labor', 'Supernatural'];
        
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
