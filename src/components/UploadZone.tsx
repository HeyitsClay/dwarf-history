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
    figures: number;
    events: number;
    sites: number;
    entities: number;
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

      // Use main thread parser (more reliable than worker for file handling)
      console.log('UploadZone: Using main thread parser...');
      setProgress({ phase: 'parsing', progress: 10, message: 'Parsing XML...' });
      
      const result = await parseLegendsFile(
        file,
        (prog, counts) => {
          console.log(`UploadZone: Progress ${prog}%`, counts);
          setProgress({
            phase: 'parsing',
            progress: 10 + Math.floor(prog * 0.7), // 10-80% for parsing
            message: `Parsing XML... ${prog}%`,
            counts,
          });
        }
      );

      console.log('UploadZone: Parsing complete, storing data...');
      setProgress({ phase: 'storing', progress: 85, message: 'Storing data...' });

      // Store data in IndexedDB
      const { figures, events, sites, entities } = result;
      console.log(`UploadZone: Storing ${figures.length} figures, ${events.length} events...`);

      // Create metadata
      const metadata: WorldMetadata = {
        name: file.name.replace(/\.xml$/i, ''),
        version: 'unknown',
        figureCount: figures.length,
        eventCount: events.length,
        siteCount: sites.length,
        entityCount: entities.length,
      };

      await db.metadata.put(metadata);

      // Bulk insert (with duplicate handling)
      await db.bulkAddFigures(figures);
      await db.bulkAddEvents(events);
      await db.bulkAddSites(sites);
      await db.bulkAddEntities(entities);

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
