import { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { db } from '../db/database';
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

export const UploadZone: React.FC<UploadZoneProps> = ({ onComplete, existingData }) => {
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const parseFile = useCallback(async (file: File) => {
    console.log('UploadZone: Starting parse for', file.name);
    setError(null);
    setProgress({ phase: 'reading', progress: 5, message: 'Initializing parser...' });

    try {
      // Clear existing data if any
      if (existingData) {
        console.log('UploadZone: Clearing existing data...');
        await db.clearAll();
      }

      // Create worker
      console.log('UploadZone: Creating worker...');
      let worker: Worker;
      try {
        worker = new Worker(new URL('../workers/xmlParser.ts', import.meta.url), {
          type: 'module',
        });
      } catch (workerErr) {
        console.error('UploadZone: Worker creation failed:', workerErr);
        throw new Error('Failed to create parser worker. Your browser may not support module workers.');
      }
      workerRef.current = worker;

      worker.onmessage = async (e) => {
        console.log('UploadZone: Worker message:', e.data.type);
        const { type, progress: prog, phase, data, error: workerError, counts } = e.data;

        if (type === 'progress') {
          setProgress({
            phase: phase === 'parsing' ? 'parsing' : 'reading',
            progress: prog,
            message: `Parsing XML... ${prog}%`,
            counts,
          });
        } else if (type === 'complete') {
          console.log('UploadZone: Parsing complete, storing data...');
          setProgress({ phase: 'storing', progress: 90, message: 'Storing data...' });

          // Store data in IndexedDB
          const { figures, events, sites, entities } = data;
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

          await db.metadata.add(metadata);

          // Bulk insert with progress
          await db.bulkAddFigures(figures);
          await db.bulkAddEvents(events);
          await db.sites.bulkAdd(sites);
          await db.entities.bulkAdd(entities);

          console.log('UploadZone: All data stored!');
          setProgress({ phase: 'storing', progress: 100, message: 'Complete!' });
          
          worker.terminate();
          workerRef.current = null;
          
          setTimeout(onComplete, 500);
        } else if (type === 'error') {
          setError(workerError);
          worker.terminate();
          workerRef.current = null;
          setProgress(null);
        }
      };

      // Handle worker errors
      worker.onerror = (err) => {
        console.error('UploadZone: Worker error:', err);
        setError(`Worker error: ${err.message}`);
        worker.terminate();
        workerRef.current = null;
        setProgress(null);
      };

      console.log('UploadZone: Starting worker with file:', file.name, file.size);
      
      // Start parsing - pass file (not transferable, will be cloned)
      worker.postMessage({
        type: 'parse',
        file,
        totalBytes: file.size,
      });

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
