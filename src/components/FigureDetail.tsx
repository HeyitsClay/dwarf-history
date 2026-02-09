import { useState, useEffect } from 'react';
import { useFigure } from '../hooks/useWorldData';
import { db } from '../db/database';
import type { HistoricalFigure, Site } from '../types';

interface FigureDetailProps {
  figureId: number;
  onNavigateFigure: (id: number) => void;
  onNavigateSite: (id: number) => void;
  onBack: () => void;
}

export const FigureDetail: React.FC<FigureDetailProps> = ({
  figureId,
  onNavigateFigure,
  onNavigateSite,
  onBack,
}) => {
  const { figure, loading } = useFigure(figureId);
  const [siteCache, setSiteCache] = useState<Map<number, Site>>(new Map());
  const [showRawXml, setShowRawXml] = useState(false);
  const [copied, setCopied] = useState(false);

  const getSiteName = async (siteId: number): Promise<string> => {
    if (siteId === -1) return 'Unknown Location';
    
    if (siteCache.has(siteId)) {
      return siteCache.get(siteId)!.name;
    }
    
    const site = await db.sites.get(siteId);
    if (site) {
      setSiteCache(prev => new Map(prev).set(siteId, site));
      return site.name;
    }
    return `Site #${siteId}`;
  };

  const copyStory = async () => {
    if (!figure) return;
    
    const lines: string[] = [
      `# ${figure.name}`,
      `*${figure.race}${figure.caste && figure.caste !== 'DEFAULT' ? ` (${figure.caste.toLowerCase()})` : ''}*`,
      '',
      `**Born:** Year ${figure.birthYear}`,
    ];
    
    if (figure.deathYear > 0) {
      lines.push(`**Died:** Year ${figure.deathYear} (aged ${figure.age})`);
    } else {
      lines.push(`**Age:** ${figure.age} years`);
    }
    
    if (figure.killer) {
      lines.push('', `**Killed by:** ${figure.killer.name} (${figure.killer.cause})`);
    }
    
    if (figure.kills && figure.kills.length > 0) {
      lines.push('', `## Combat Record (${figure.kills.length} kills)`, '');
      
      for (const kill of figure.kills) {
        const siteName = await getSiteName(kill.siteId);
        lines.push(`- **Year ${kill.year}:** Killed ${kill.victimName} (${kill.victimRace}) at ${siteName} — ${kill.cause}`);
      }
    }
    
    if (figure.hfSkills && figure.hfSkills.length > 0) {
      lines.push('', '## Skills', '');
      for (const skill of figure.hfSkills.slice(0, 10)) {
        lines.push(`- ${skill.skill.replace(/_/g, ' ')}: ${skill.totalIp} XP`);
      }
    }
    
    const story = lines.join('\n');
    navigator.clipboard.writeText(story);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="detail-loading">Loading figure...</div>;
  }

  if (!figure) {
    return (
      <div className="detail-error">
        <p>Figure not found</p>
        <button onClick={onBack}>Go Back</button>
      </div>
    );
  }

  const killCount = figure.kills?.length || 0;

  return (
    <div className="figure-detail">
      <div className="detail-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <button className="btn-copy" onClick={copyStory}>
          {copied ? '✓ Copied!' : '📋 Copy Story'}
        </button>
      </div>

      <div className="detail-vitals">
        <h1>{figure.name}</h1>
        <div className="vitals-grid">
          <div className="vital">
            <label>Race</label>
            <span>{figure.race}</span>
          </div>
          {figure.caste && figure.caste !== 'DEFAULT' && (
            <div className="vital">
              <label>Caste</label>
              <span>{figure.caste}</span>
            </div>
          )}
          <div className="vital">
            <label>Born</label>
            <span>Year {figure.birthYear}</span>
          </div>
          {figure.deathYear > 0 ? (
            <>
              <div className="vital">
                <label>Died</label>
                <span>Year {figure.deathYear}</span>
              </div>
              <div className="vital">
                <label>Age</label>
                <span>{figure.age} years</span>
              </div>
            </>
          ) : (
            <div className="vital">
              <label>Age</label>
              <span>{figure.age} years (alive)</span>
            </div>
          )}
          <div className="vital">
            <label>Kills</label>
            <span className={killCount > 0 ? 'has-kills' : ''}>
              {killCount > 0 ? `⚔️ ${killCount}` : 'None'}
            </span>
          </div>
        </div>
      </div>

      {figure.killer && (
        <div className="detail-section death-section">
          <h2>💀 Death</h2>
          <p>
            Killed by{' '}
            <button
              className="link"
              onClick={() => onNavigateFigure(figure.killer!.hfid)}
            >
              {figure.killer.name}
            </button>
            {' '}in year {figure.killer.year}
            {' '}({figure.killer.cause})
          </p>
        </div>
      )}

      {killCount > 0 && (
        <div className="detail-section kills-section">
          <h2>⚔️ Combat Record ({killCount} kills)</h2>
          <ul className="kill-list">
            {figure.kills!.map((kill, idx) => (
              <KillItem
                key={idx}
                kill={kill}
                onNavigateFigure={onNavigateFigure}
                onNavigateSite={onNavigateSite}
              />
            ))}
          </ul>
        </div>
      )}

      {figure.hfSkills && figure.hfSkills.length > 0 && (
        <div className="detail-section skills-section">
          <h2>🎯 Skills</h2>
          <ul className="skill-list">
            {figure.hfSkills.map((skill, idx) => (
              <li key={idx}>
                <span className="skill-name">{skill.skill.replace(/_/g, ' ')}</span>
                <span className="skill-xp">{skill.totalIp.toLocaleString()} XP</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {figure.spheres && figure.spheres.length > 0 && (
        <div className="detail-section spheres-section">
          <h2>✨ Spheres</h2>
          <div className="sphere-tags">
            {figure.spheres.map((sphere, idx) => (
              <span key={idx} className="sphere-tag">{sphere}</span>
            ))}
          </div>
        </div>
      )}

      {figure.entityLinks && figure.entityLinks.length > 0 && (
        <div className="detail-section entities-section">
          <h2>🏛️ Entity Links</h2>
          <ul className="entity-list">
            {figure.entityLinks.map((link, idx) => (
              <li key={idx}>
                <span className="link-type">{link.linkType}</span>
                {' '}
                <button
                  className="link"
                  onClick={() => onNavigateSite(link.entityId)}
                >
                  Entity #{link.entityId}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="detail-section raw-section">
        <button
          className="raw-toggle"
          onClick={() => setShowRawXml(!showRawXml)}
        >
          {showRawXml ? '▼' : '▶'} Raw XML
        </button>
        {showRawXml && (
          <pre className="raw-xml">{generateRawXml(figure)}</pre>
        )}
      </div>
    </div>
  );
};

interface KillItemProps {
  kill: HistoricalFigure['kills'][0];
  onNavigateFigure: (id: number) => void;
  onNavigateSite: (id: number) => void;
}

const KillItem = ({ kill, onNavigateFigure, onNavigateSite }: KillItemProps) => {
  const [siteName, setSiteName] = useState<string | null>(null);

  useEffect(() => {
    if (kill.siteId !== -1) {
      db.sites.get(kill.siteId).then(site => {
        if (site) setSiteName(site.name);
      });
    }
  }, [kill.siteId]);

  return (
    <li className="kill-item">
      <span className="kill-year">Year {kill.year}</span>
      <span className="kill-victim">
        Killed{' '}
        <button className="link" onClick={() => onNavigateFigure(kill.victimId)}>
          {kill.victimName}
        </button>
        {' '}({kill.victimRace})
      </span>
      <span className="kill-location">
        at{' '}
        {kill.siteId !== -1 ? (
          <button className="link" onClick={() => onNavigateSite(kill.siteId)}>
            {siteName || `Site #${kill.siteId}`}
          </button>
        ) : (
          'unknown location'
        )}
      </span>
      <span className="kill-cause">— {kill.cause}</span>
    </li>
  );
};

function generateRawXml(figure: HistoricalFigure): string {
  const lines = ['<historical_figure>'];
  lines.push(`  <id>${figure.id}</id>`);
  lines.push(`  <name>${figure.name}</name>`);
  lines.push(`  <race>${figure.race}</race>`);
  lines.push(`  <caste>${figure.caste}</caste>`);
  lines.push(`  <appeared>${figure.appeared}</appeared>`);
  lines.push(`  <birth_year>${figure.birthYear}</birth_year>`);
  lines.push(`  <birth_seconds72>${figure.birthSeconds72}</birth_seconds72>`);
  lines.push(`  <death_year>${figure.deathYear}</death_year>`);
  lines.push(`  <death_seconds72>${figure.deathSeconds72}</death_seconds72>`);
  lines.push(`  <associated_type>${figure.associatedType}</associated_type>`);
  
  if (figure.holdsArtifact !== undefined) {
    lines.push(`  <holds_artifact>${figure.holdsArtifact}</holds_artifact>`);
  }
  
  for (const link of figure.entityLinks || []) {
    lines.push('  <entity_link>');
    lines.push(`    <link_type>${link.linkType}</link_type>`);
    lines.push(`    <entity_id>${link.entityId}</entity_id>`);
    lines.push('  </entity_link>');
  }
  
  for (const link of figure.hfLinks || []) {
    lines.push('  <hf_link>');
    lines.push(`    <link_type>${link.linkType}</link_type>`);
    lines.push(`    <hfid>${link.hfid}</hfid>`);
    lines.push('  </hf_link>');
  }
  
  for (const skill of figure.hfSkills || []) {
    lines.push('  <hf_skill>');
    lines.push(`    <skill>${skill.skill}</skill>`);
    lines.push(`    <total_ip>${skill.totalIp}</total_ip>`);
    lines.push('  </hf_skill>');
  }
  
  for (const sphere of figure.spheres || []) {
    lines.push(`  <sphere>${sphere}</sphere>`);
  }
  
  lines.push('</historical_figure>');
  return lines.join('\n');
}
