import Dexie, { type Table } from 'dexie';
import { Chat, Message, ImageBlob, Prompt } from './types';
import { DB_NAME } from './constants';

export class OkobitDB extends Dexie {
  chats!: Table<Chat>;
  messages!: Table<Message>;
  images!: Table<ImageBlob>;
  prompts!: Table<Prompt>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      chats: 'id, orderIndex, pinned, updatedAt',
      messages: 'id, chatId, timestamp',
      images: 'id, createdAt, isGalleryVisible',
      prompts: '++id, type, timestamp'
    });
    
    // Version 2: Index imageIds to allow finding orphaned images efficiently
    this.version(2).stores({
      messages: 'id, chatId, timestamp, *imageIds'
    });

    // Version 3: Add galleryTimestamp for sparse indexing (performance fix)
    this.version(3).stores({
      images: 'id, createdAt, isGalleryVisible, galleryTimestamp'
    }).upgrade(tx => {
      // Migrate existing gallery items to have the index field
      return tx.table('images').toCollection().modify(img => {
        if (img.isGalleryVisible && !img.galleryTimestamp) {
          img.galleryTimestamp = img.createdAt;
        }
      });
    });
  }
}

export const db = new OkobitDB();