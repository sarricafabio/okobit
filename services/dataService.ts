import { db } from '../db';

/**
 * Safely deletes messages and their associated images if they are not bookmarked
 * and not referenced by other messages (e.g. forks).
 */
export async function deleteMessagesSafe(messageIds: string[]) {
    await db.transaction('rw', db.messages, db.images, async () => {
        const messages = await db.messages.bulkGet(messageIds);
        const validMessages = messages.filter((m): m is import('../types').Message => !!m);
        
        const allImageIds = new Set<string>();
        validMessages.forEach(m => {
            if (m.imageIds) m.imageIds.forEach(id => allImageIds.add(id));
        });

        if (allImageIds.size > 0) {
            const imageIdsToCheck = Array.from(allImageIds);
            const images = await db.images.bulkGet(imageIdsToCheck);
            const imagesToDelete: string[] = [];

            for (const img of images) {
                if (!img) continue;
                
                // If bookmarked (Saved to Gallery), we MUST keep it regardless of message deletion
                if (img.isGalleryVisible) continue;

                // Check if referenced by other messages NOT in the deletion list (e.g. forks)
                // We fetch all messages that use this image ID
                const msgsUsingImage = await db.messages.where('imageIds').equals(img.id).primaryKeys();
                
                // If any message using this image is NOT in the list of messages we are deleting, we must keep the image
                const isReferencedElsewhere = msgsUsingImage.some(msgId => !messageIds.includes(msgId as string));
                
                if (!isReferencedElsewhere) {
                    imagesToDelete.push(img.id);
                }
            }

            if (imagesToDelete.length > 0) {
                await db.images.bulkDelete(imagesToDelete);
            }
        }
        
        await db.messages.bulkDelete(messageIds);
    });
}