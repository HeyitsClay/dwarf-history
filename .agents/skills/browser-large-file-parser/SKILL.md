---
name: browser-large-file-parser
description: Parse large files (100MB+) in browser without stack overflow or memory issues. Use when processing large CSV, JSON, XML, or text files in browser environments, handling File/Blob objects, or when encountering "Maximum call stack size exceeded" errors with large datasets.
---

# Browser Large File Parser

Techniques for parsing massive files in browser without crashing.

## The Stack Overflow Trap

**NEVER use spread operators on large arrays:**
```typescript
// ❌ CRASHES on large files - stack overflow
const maxYear = Math.max(...years);  
const maxId = Math.max(...objects.map(o => o.id));

// ✅ SAFE - use reduce instead
const maxYear = years.reduce((max, y) => y > max ? y : max, 0);
const maxId = objects.reduce((max, o) => o.id > max ? o.id : max, 0);
```

**Also avoid:**
- `Array.prototype.push(...largeArray)` - spreads into arguments
- `Function.prototype.apply(null, largeArray)` - same issue
- Deep recursion without tail call optimization

## Web Worker Architecture

**Always parse large files in a Web Worker** to avoid blocking the main thread:

```typescript
// main.ts
const worker = new Worker(new URL('./parser.worker.ts', import.meta.url));

worker.postMessage({ file, chunkSize: 512 * 1024 }, [file]); // Transfer ownership

worker.onmessage = (e) => {
  if (e.data.type === 'progress') updateProgress(e.data.percent);
  if (e.data.type === 'complete') handleResult(e.data.data);
  if (e.data.type === 'error') handleError(e.data.error);
};
```

```typescript
// parser.worker.ts
self.onmessage = async (e) => {
  const { file, chunkSize } = e.data;
  const reader = new FileReaderSync();
  const totalChunks = Math.ceil(file.size / chunkSize);
  
  for (let i = 0; i < totalChunks; i++) {
    const chunk = file.slice(i * chunkSize, (i + 1) * chunkSize);
    const text = reader.readAsText(chunk);
    parseChunk(text, i === 0, i === totalChunks - 1);
    
    // Report progress every 10 chunks to reduce message overhead
    if (i % 10 === 0) {
      self.postMessage({ type: 'progress', percent: (i / totalChunks) * 100 });
    }
  }
  
  self.postMessage({ type: 'complete', data: result });
};
```

## Chunking Strategy

**Optimal chunk size: 512KB**
- Small enough: Won't blow stack during processing
- Large enough: Minimizes iteration overhead
- Handles multi-byte characters correctly when slicing

**State management across chunks:**
```typescript
class StreamingParser {
  private buffer = '';  // Carryover from previous chunk
  private state: ParserState;

  parseChunk(chunk: string, isFirst: boolean, isLast: boolean): void {
    const data = this.buffer + chunk;
    const processableEnd = data.lastIndexOf('\n'); // Or other delimiter
    
    if (processableEnd === -1) {
      this.buffer = data;  // Whole chunk is incomplete
      return;
    }
    
    const processable = data.slice(0, processableEnd);
    this.buffer = data.slice(processableEnd + 1);
    
    // Process complete lines only
    for (const line of processable.split('\n')) {
      this.processLine(line);
    }
    
    if (isLast && this.buffer) {
      this.processLine(this.buffer);  // Final incomplete line
    }
  }
}
```

## Parsing Strategy: indexOf vs Regex

**Performance hierarchy for large files:**
1. **indexOf/lastIndexOf** - Fastest, O(n), no regex engine overhead
2. **charAt/charCodeAt** - Good for character-by-character state machines
3. **Regex** - Avoid for large files - can be O(n²) or cause stack issues

```typescript
// ✅ FAST: indexOf for finding tags
const tagStart = chunk.indexOf('<', pos);
const tagEnd = chunk.indexOf('>', tagStart);
const tagContent = chunk.slice(tagStart + 1, tagEnd);

// ✅ FAST: charCodeAt for tokenization
for (let i = 0; i < chunk.length; i++) {
  const char = chunk.charCodeAt(i);
  if (char === 60) { // '<'
    // Start of tag
  }
}

// ❌ SLOW: Regex on large strings
const matches = largeString.match(/<tag>(.*?)<\/tag>/gs);
```

## Memory Management

**Filter before storing:**
```typescript
// Filter invalid data BEFORE adding to arrays or IDB
const validItems = items.filter(item => 
  item.id !== null && 
  item.id !== undefined && 
  !isNaN(item.id)
);

// Remove duplicates using Map (O(n) vs O(n²))
const unique = Array.from(new Map(items.map(i => [i.id, i])).values());
```

**Batch IndexedDB operations:**
```typescript
const BATCH_SIZE = 500;
for (let i = 0; i < items.length; i += BATCH_SIZE) {
  const batch = items.slice(i, i + BATCH_SIZE);
  await db.table.bulkPut(batch);
  
  // Yield to event loop for UI updates
  if (i % (BATCH_SIZE * 10) === 0) {
    await new Promise(r => requestAnimationFrame(r));
  }
}
```

## State Machine Pattern

For complex formats (XML, JSON streams), use explicit state:

```typescript
type ParserState = 
  | { type: 'TEXT' }
  | { type: 'TAG'; name: string; attrs: Record<string, string> }
  | { type: 'CDATA' };

class XMLParser {
  private state: ParserState = { type: 'TEXT' };
  private currentElement: Partial<Element> = {};
  
  parseChunk(chunk: string): void {
    let pos = 0;
    while (pos < chunk.length) {
      switch (this.state.type) {
        case 'TEXT':
          const tagStart = chunk.indexOf('<', pos);
          if (tagStart === -1) { pos = chunk.length; break; }
          // Process text content...
          pos = tagStart;
          this.state = { type: 'TAG', name: '', attrs: {} };
          break;
          
        case 'TAG':
          // Parse tag name and attributes...
          break;
      }
    }
  }
}
```

## Quick Reference

| Problem | Solution |
|---------|----------|
| Stack overflow | Use `reduce()` instead of `Math.max(...arr)` |
| UI freezing | Move parsing to Web Worker |
| Out of memory | Stream with 512KB chunks |
| Slow parsing | Use `indexOf` instead of regex |
| Corrupt multi-byte chars | Slice on delimiters, not byte offsets |
| IDB transaction timeouts | Batch in 500-item chunks |
