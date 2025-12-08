import JSZip from 'jszip';
import { db } from '../db';
import { AppConfig } from '../types';
import { createThumbnail } from './geminiService';

export interface ExportProgress {
  message: string;
  percent: number;
}

/**
 * Exports all app data into a ZIP file.
 * Structure:
 * - okobit_data.json: Metadata for chats, messages, prompts, config, and image records.
 * - images/: Folder containing raw image files named by ID.
 */
export const exportData = async (
  config: AppConfig,
  onProgress: (p: ExportProgress) => void
): Promise<Blob> => {
  const zip = new JSZip();
  
  onProgress({ message: 'Gathering metadata...', percent: 5 });

  // 1. Gather Metadata
  const chats = await db.chats.toArray();
  const messages = await db.messages.toArray();
  const prompts = await db.prompts.toArray();
  const images = await db.images.toArray(); // Get metadata + blobs

  // Sanitize config (remove API Key)
  const exportConfig = { ...config, apiKey: '' };

  const metadata = {
    version: 4,
    exportedAt: Date.now(),
    config: exportConfig,
    chats,
    messages,
    prompts,
    images: images.map(img => ({
      id: img.id,
      mimeType: img.mimeType,
      createdAt: img.createdAt,
      isGalleryVisible: img.isGalleryVisible,
      galleryTimestamp: img.galleryTimestamp // Include sparse index field
    }))
  };

  zip.file('okobit_data.json', JSON.stringify(metadata, null, 2));

  // 2. Add Images to Archive
  const imgFolder = zip.folder('images');
  if (imgFolder && images.length > 0) {
    let processed = 0;
    const total = images.length;
    
    for (const img of images) {
       // Determine extension from mimeType
       const ext = img.mimeType.split('/')[1] || 'bin';
       const filename = `${img.id}.${ext}`;
       imgFolder.file(filename, img.blob);
       
       processed++;
       // Update progress periodically
       if (processed % 5 === 0 || processed === total) {
         // Map image processing to 5% -> 60% of total progress
         const percent = 5 + ((processed / total) * 55); 
         onProgress({ 
           message: `Packing image ${processed}/${total}`, 
           percent 
         });
         // Yield to main thread
         await new Promise(r => setTimeout(r, 0)); 
       }
    }
  }

  // 3. Compress and Generate
  onProgress({ message: 'Compressing archive...', percent: 60 });

  const content = await zip.generateAsync({ 
      type: 'blob', 
      compression: 'DEFLATE', 
      compressionOptions: { level: 6 } 
  }, (meta) => {
      // Map compression to 60% -> 100%
      const percent = 60 + (meta.percent * 0.4);
      onProgress({ 
        message: `Compressing... ${meta.percent.toFixed(0)}%`, 
        percent 
      });
  });

  return content;
};

/**
 * Imports data from a ZIP file or Legacy JSON.
 * ADDITIVE MERGE: Existing data is preserved. Duplicates are skipped.
 */
export const importData = async (
  file: File,
  onProgress: (p: ExportProgress) => void
): Promise<AppConfig | null> => {
  
  // Handle Legacy JSON
  if (file.type === 'application/json' || file.name.endsWith('.json')) {
      return importLegacyJson(file, onProgress);
  }

  onProgress({ message: 'Reading archive...', percent: 0 });
  
  const zip = await JSZip.loadAsync(file);
  
  const dataFile = zip.file('okobit_data.json') || zip.file('data.json');
  if (!dataFile) throw new Error("Invalid backup: data file missing");

  onProgress({ message: 'Parsing metadata...', percent: 10 });
  const jsonStr = await dataFile.async('text');
  const data = JSON.parse(jsonStr);

  onProgress({ message: 'Merging metadata...', percent: 15 });
  
  // Transaction 1: Merge Metadata
  // We check for existing IDs and only insert new ones.
  await db.transaction('rw', db.chats, db.messages, db.prompts, db.images, async () => {
      if (data.chats && data.chats.length > 0) {
          const existingIds = new Set(await db.chats.toCollection().primaryKeys());
          const newChats = data.chats.filter((c: any) => !existingIds.has(c.id));
          if (newChats.length > 0) await db.chats.bulkAdd(newChats);
      }

      if (data.messages && data.messages.length > 0) {
          const existingIds = new Set(await db.messages.toCollection().primaryKeys());
          const newMessages = data.messages.filter((m: any) => !existingIds.has(m.id));
          if (newMessages.length > 0) await db.messages.bulkAdd(newMessages);
      }

      if (data.prompts && data.prompts.length > 0) {
          // Prompts are history logs. To prevent ID collision with local auto-increment,
          // we strip the ID and insert as new entries. 
          const promptsToAdd = data.prompts.map((p: any) => {
              const { id, ...rest } = p;
              return rest;
          });
          await db.prompts.bulkAdd(promptsToAdd);
      }
  });

  // Transaction 2+: Process and Insert Images in Batches
  if (data.images && Array.isArray(data.images)) {
      const total = data.images.length;
      let processed = 0;
      const BATCH_SIZE = 5;
      const imgFolder = zip.folder('images');
      
      for (let i = 0; i < total; i += BATCH_SIZE) {
          const batch = data.images.slice(i, i + BATCH_SIZE);
          
          // Filter out images we already have
          const batchIds = batch.map((img: any) => img.id);
          const existingIds = new Set(await db.images.where('id').anyOf(batchIds).primaryKeys());
          const candidates = batch.filter((img: any) => !existingIds.has(img.id));

          const itemsToAdd: any[] = [];

          // PREPARE batches (Async unzip + Thumbnail Gen) - Safe outside transaction
          if (candidates.length > 0) {
              await Promise.all(candidates.map(async (imgMeta: any) => {
                  const ext = imgMeta.mimeType.split('/')[1] || 'bin';
                  const filename = `${imgMeta.id}.${ext}`;
                  
                  let imgFile = imgFolder?.file(filename);
                  if (!imgFile) imgFile = imgFolder?.file(imgMeta.id);

                  if (imgFile) {
                      const arrayBuffer = await imgFile.async('arraybuffer');
                      const blob = new Blob([arrayBuffer], { type: imgMeta.mimeType });
                      
                      // Regenerate thumbnail for UI performance
                      const thumbnail = await createThumbnail(blob);

                      itemsToAdd.push({
                          id: imgMeta.id,
                          blob: blob,
                          thumbnail: thumbnail,
                          mimeType: imgMeta.mimeType,
                          createdAt: imgMeta.createdAt,
                          isGalleryVisible: imgMeta.isGalleryVisible,
                          // Restore galleryTimestamp if present, or infer it if visible
                          galleryTimestamp: imgMeta.isGalleryVisible ? (imgMeta.galleryTimestamp || imgMeta.createdAt) : undefined
                      });
                  }
              }));
          }

          // INSERT batch
          if (itemsToAdd.length > 0) {
              await db.images.bulkAdd(itemsToAdd);
          }

          processed += batch.length;
          const percent = 20 + ((Math.min(processed, total) / total) * 80);
          onProgress({ 
              message: `Restoring images ${Math.min(processed, total)}/${total}`, 
              percent 
          });
      }
  }

  return data.config || null;
};

// Fallback for old JSON exports
const importLegacyJson = async (file: File, onProgress: (p: ExportProgress) => void): Promise<AppConfig | null> => {
    onProgress({ message: 'Reading JSON...', percent: 10 });
    const text = await file.text();
    const data = JSON.parse(text);

    onProgress({ message: 'Merging data...', percent: 50 });
    await db.transaction('rw', db.chats, db.messages, db.prompts, db.images, async () => {
        // Chats
        if (data.chats) {
            const existing = new Set(await db.chats.toCollection().primaryKeys());
            const toAdd = data.chats.filter((x: any) => !existing.has(x.id));
            if (toAdd.length) await db.chats.bulkAdd(toAdd);
        }
        
        // Messages
        if (data.messages) {
            const existing = new Set(await db.messages.toCollection().primaryKeys());
            const toAdd = data.messages.filter((x: any) => !existing.has(x.id));
            if (toAdd.length) await db.messages.bulkAdd(toAdd);
        }

        // Prompts
        if (data.prompts) {
             const toAdd = data.prompts.map((p: any) => { const {id, ...r} = p; return r; });
             await db.prompts.bulkAdd(toAdd);
        }
        
        // Images (Legacy)
        if (data.images) {
            const existing = new Set(await db.images.toCollection().primaryKeys());
            const candidates = data.images.filter((x: any) => !existing.has(x.id));
            
            if (candidates.length > 0) {
                const hydratedImages = candidates.map((img: any) => {
                    const byteCharacters = atob(img.blob);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    return { 
                        ...img, 
                        blob: new Blob([byteArray], { type: img.mimeType }),
                        galleryTimestamp: img.isGalleryVisible ? img.createdAt : undefined // Infer sparse index
                    };
                });
                await db.images.bulkAdd(hydratedImages);
            }
        }
    });
    
    onProgress({ message: 'Done', percent: 100 });
    return data.config || null;
};