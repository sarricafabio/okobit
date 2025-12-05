
import { db } from '../db';

/**
 * Checks if an image is referenced by any message in the database.
 * Requires 'imageIds' to be indexed in db.messages.
 */
async function isImageReferenced(imageId: string): Promise<boolean> {
    const count = await db.messages.where('imageIds').equals(imageId).count();
    return count > 0;
}

/**
 * Checks a list of image IDs and deletes them if they are:
 * 1. Not in the gallery (isGalleryVisible is false)
 * 2. Not referenced by any existing message
 */
export async function deleteImagesIfOrphaned(imageIds: string[]) {
    if (imageIds.length === 0) return;

    await db.transaction('rw', db.images, db.messages, async () => {
        // 1. Filter out images that are bookmarked in gallery
        const images = await db.images.where('id').anyOf(imageIds).toArray();
        const candidates = images.filter(img => !img.isGalleryVisible).map(img => img.id);

        if (candidates.length === 0) return;

        // 2. For remaining candidates, check if they are still referenced
        const toDelete: string[] = [];
        for (const id of candidates) {
            const referenced = await isImageReferenced(id);
            if (!referenced) {
                toDelete.push(id);
            }
        }

        // 3. Delete verified orphans
        if (toDelete.length > 0) {
            await db.images.bulkDelete(toDelete);
        }
    });
}

/**
 * Forcefully deletes images and removes their references from all messages.
 * Use this when the user explicitly requests to delete specific images (e.g. from Gallery or Lightbox).
 * This ensures no broken references remain in any chat (forked or otherwise).
 */
export async function forceDeleteImages(imageIds: string[]) {
    if (imageIds.length === 0) return;

    await db.transaction('rw', db.images, db.messages, async () => {
        // 1. Delete the image blobs
        await db.images.bulkDelete(imageIds);

        // 2. Find messages referencing these images using the multientry index
        const msgs = await db.messages.where('imageIds').anyOf(imageIds).toArray();
        
        // 3. Update messages to remove the deleted IDs
        // We iterate and update to ensure atomicity within the transaction
        for (const m of msgs) {
            if (m.imageIds) {
                // Filter out any of the deleted IDs
                const newIds = m.imageIds.filter(id => !imageIds.includes(id));
                
                // Only update if changes occurred
                if (newIds.length !== m.imageIds.length) {
                    await db.messages.update(m.id, { imageIds: newIds });
                }
            }
        }
    });
}

/**
 * Deletes messages and cleans up their images if those images become orphaned.
 * Use this instead of db.messages.delete()
 */
export async function deleteMessagesWithCleanup(messageIds: string[]) {
    if (messageIds.length === 0) return;

    await db.transaction('rw', db.messages, db.images, async () => {
        // 1. Identify potential orphan images BEFORE deleting messages
        const messages = await db.messages.where('id').anyOf(messageIds).toArray();
        const candidateImageIds = new Set<string>();
        
        messages.forEach(msg => {
            if (msg.imageIds && msg.imageIds.length > 0) {
                msg.imageIds.forEach(id => candidateImageIds.add(id));
            }
        });

        // 2. Delete the messages
        await db.messages.bulkDelete(messageIds);

        // 3. Check candidates
        if (candidateImageIds.size > 0) {
            await deleteImagesIfOrphaned(Array.from(candidateImageIds));
        }
    });
}

/**
 * Deletes a chat and performs cleanup.
 */
export async function deleteChatWithCleanup(chatId: string) {
    await db.transaction('rw', db.chats, db.messages, db.images, async () => {
        // 1. Gather messages and images
        const messages = await db.messages.where('chatId').equals(chatId).toArray();
        const messageIds = messages.map(m => m.id);
        const candidateImageIds = new Set<string>();
        
        messages.forEach(msg => {
            if (msg.imageIds && msg.imageIds.length > 0) {
                msg.imageIds.forEach(id => candidateImageIds.add(id));
            }
        });

        // 2. Delete messages and chat
        await db.messages.bulkDelete(messageIds);
        await db.chats.delete(chatId);

        // 3. Cleanup images
        if (candidateImageIds.size > 0) {
            await deleteImagesIfOrphaned(Array.from(candidateImageIds));
        }
    });
}

/**
 * Scans the entire database for orphaned images and deletes them.
 * Useful for maintenance or fixing legacy data.
 */
export async function cleanupOrphanedImages(): Promise<number> {
    try {
        return await db.transaction('rw', db.images, db.messages, async () => {
            const allImages = await db.images.toArray();
            // Candidates: Not in gallery
            const candidates = allImages.filter(img => !img.isGalleryVisible).map(img => img.id);
            
            if (candidates.length === 0) return 0;

            const toDelete: string[] = [];
            
            for (const id of candidates) {
                const referenced = await isImageReferenced(id);
                if (!referenced) {
                    toDelete.push(id);
                }
            }

            if (toDelete.length > 0) {
                await db.images.bulkDelete(toDelete);
                // Optional: Log cleanup result for debugging
                // console.log(`Auto-cleanup: Removed ${toDelete.length} orphaned images.`);
            }
            
            return toDelete.length;
        });
    } catch (e) {
        console.error("Auto-cleanup failed", e);
        return 0;
    }
}
