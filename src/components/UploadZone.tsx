import { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { db } from '../db/database';
import { parseLegendsFile } from '../xmlParserMain';
import type { WorldMetadata } from '../types';

interface UploadZoneProps {
  onComplete: () => void;
  existingData: boolean;
}

interface ParseProgress {
  phase: 'reading' | 'parsing' | 'indexing' | 'storing';
  progress: number;
  message: string;
  counts?: {
    regions: number;
    undergroundRegions: number;
    sites: number;
    figures: number;
    entities: number;
    artifacts: number;
    writtenContents: number;
    events: number;
    eventCollections: number;
  };
}

export const UploadZone = ({ onComplete, existingData }: UploadZoneProps) => {
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const parseFile = useCallback(async (file: File) => {
    console.log('UploadZone: Starting parse for', file.name, 'size:', file.size);
    setError(null);
    setProgress({ phase: 'reading', progress: 5, message: 'Reading file...' });

    try {
      // Clear existing data if any
      if (existingData) {
        console.log('UploadZone: Clearing existing data...');
        await db.clearAll();
      }

      // Use main thread parser
      console.log('UploadZone: Using main thread parser...');
      setProgress({ phase: 'parsing', progress: 10, message: 'Parsing XML...' });
      
      const result = await parseLegendsFile(
        file,
        (prog, _phase, counts) => {
          console.log(`UploadZone: Progress ${prog}%`, counts);
          setProgress({
            phase: 'parsing',
            progress: 10 + Math.floor(prog * 0.7),
            message: `Parsing XML... ${prog}%`,
            counts: {
              regions: counts.regions || 0,
              undergroundRegions: counts.undergroundRegions || 0,
              sites: counts.sites || 0,
              figures: counts.figures || 0,
              entities: counts.entities || 0,
              artifacts: counts.artifacts || 0,
              writtenContents: counts.writtenContents || 0,
              events: counts.events || 0,
              eventCollections: counts.eventCollections || 0,
            },
          });
        }
      );

      console.log('UploadZone: Parsing complete, storing data...');
      setProgress({ phase: 'storing', progress: 85, message: 'Storing data...' });

      // Create metadata
      const metadata: WorldMetadata = {
        name: result.worldName,
        version: 'unknown',
        year: result.currentYear,
        currentYear: result.currentYear,
        regionCount: result.regions.length,
        undergroundRegionCount: result.undergroundRegions.length,
        siteCount: result.sites.length,
        figureCount: result.figures.length,
        entityCount: result.entities.length,
        artifactCount: result.artifacts.length,
        eventCount: result.events.length,
        eventCollectionCount: result.eventCollections.length,
        writtenContentCount: result.writtenContents.length,
      };

      await db.metadata.put(metadata);

      // Bulk insert all data types
      await Promise.all([
        db.bulkAddRegions(result.regions),
        db.bulkAddUndergroundRegions(result.undergroundRegions),
        db.bulkAddSites(result.sites),
        db.bulkAddFigures(result.figures),
        db.bulkAddEntities(result.entities),
        db.bulkAddArtifacts(result.artifacts),
        db.bulkAddWrittenContents(result.writtenContents),
        db.bulkAddEvents(result.events),
        db.bulkAddEventCollections(result.eventCollections),
      ]);

      console.log('UploadZone: All data stored!');
      setProgress({ phase: 'storing', progress: 100, message: 'Complete!' });
      
      setTimeout(onComplete, 500);

    } catch (err) {
      console.error('UploadZone: Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to parse file');
      setProgress(null);
    }
  }, [existingData, onComplete]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      parseFile(file);
    }
  }, [parseFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/xml': ['.xml'],
      'text/xml': ['.xml'],
    },
    multiple: false,
    disabled: progress !== null,
  });

  const handleCancel = () => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setProgress(null);
    setError(null);
  };

  if (progress) {
    return (
      <div className="upload-progress">
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progress.progress}%` }}
          />
        </div>
        <p className="progress-message">{progress.message}</p>
        {progress.counts && (
          <div className="progress-counts">
            <span>Figures: {progress.counts.figures.toLocaleString()}</span>
            <span>Events: {progress.counts.events.toLocaleString()}</span>
            <span>Sites: {progress.counts.sites.toLocaleString()}</span>
            <span>Entities: {progress.counts.entities.toLocaleString()}</span>
            <span>Artifacts: {progress.counts.artifacts.toLocaleString()}</span>
            <span>Wars: {progress.counts.eventCollections.toLocaleString()}</span>
          </div>
        )}
        <button className="btn-cancel" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="upload-container">
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'active' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="dropzone-content">
          <div className="dropzone-icon">📜</div>
          <p className="dropzone-text">
            {isDragActive
              ? 'Drop the Legends XML file here...'
              : 'Drag & drop your Legends XML file here, or click to select'}
          </p>
          <p className="dropzone-hint">
            Supports Dwarf Fortress Legends export files (*.xml)
          </p>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {existingData && (
        <p className="existing-data-warning">
          ⚠️ Existing world data will be replaced
        </p>
      )}
    </div>
  );
};
