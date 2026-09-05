import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

export const supabase = createClient(
    config.supabaseUrl,
    config.supabaseServiceRoleKey
);

/**
 * This is the core of "memory": every user is identified by their
 * WhatsApp phone number (wa_id). If they've messaged before, we find
 * their existing row (and their history comes with it). If not, we
 * create a fresh one.
 */
export async function getOrCreateUser(waId) {
    const { data: existing, error: findError } = await supabase
        .from("users")
        .select("*")
        .eq("wa_id", waId)
        .maybeSingle();

    if (findError) throw findError;

    if (existing) {
        // Update last_seen_at so we know this user is active again.
        await supabase
            .from("users")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", existing.id);
        return { user: existing, isNew: false };
    }

    const { data: created, error: createError } = await supabase
        .from("users")
        .insert({ wa_id: waId })
        .select()
        .single();

    if (createError) throw createError;
    return { user: created, isNew: true };
}

/**
 * Gets (or creates) the one ongoing conversation for a user.
 * Simple model for now: one conversation per user, forever.
 */
export async function getOrCreateConversation(userId) {
    const { data: existing, error: findError } = await supabase
        .from("conversations")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

    if (findError) throw findError;
    if (existing) return existing;

    const { data: created, error: createError } = await supabase
        .from("conversations")
        .insert({ user_id: userId })
        .select()
        .single();

    if (createError) throw createError;
    return created;
}

/**
 * Saves one message (either from the user or from the bot) into memory.
 */
export async function saveMessage({
    conversationId,
    userId,
    role, // 'user' | 'assistant'
    content,
    messageType = "text",
    mediaUrl = null,
}) {
    const { data, error } = await supabase
        .from("messages")
        .insert({
            conversation_id: conversationId,
            user_id: userId,
            role,
            content,
            message_type: messageType,
            media_url: mediaUrl,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Saves one answer into the user's demographics jsonb, and advances
 * them to the next onboarding step (or 'done').
 */
export async function saveOnboardingAnswer({ user, field, value, nextStep }) {
    const updatedDemographics = { ...user.demographics, [field]: value };

    const { data, error } = await supabase
        .from("users")
        .update({
            demographics: updatedDemographics,
            onboarding_step: nextStep,
        })
        .eq("id", user.id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Pulls recent message history for a user — this is what makes the
 * bot "remember" past conversations, even across days.
 */
export async function getRecentMessages(userId, limit = 20) {
    const { data, error } = await supabase
        .from("messages")
        .select("role, content, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) throw error;
    return (data || []).reverse(); // oldest first, for building a prompt later
}

/**
 * Uploads a file's raw bytes to the private "user-files" bucket,
 * namespaced by the user's WhatsApp number so files don't collide.
 * Returns the storage path (not a public URL — the bucket is private).
 */
export async function uploadFileToStorage({ waId, fileName, buffer, mimeType }) {
    const storagePath = `${waId}/${Date.now()}-${fileName}`;

    const { error } = await supabase.storage
        .from("user-files")
        .upload(storagePath, buffer, {
            contentType: mimeType,
            upsert: false,
        });

    if (error) throw error;
    return storagePath;
}

/**
 * Records file metadata in the `files` table, linked to the message
 * that delivered it.
 */
export async function saveFileRecord({ userId, messageId, fileName, storagePath, mimeType }) {
    const { error } = await supabase.from("files").insert({
        user_id: userId,
        message_id: messageId,
        file_name: fileName,
        storage_path: storagePath,
        mime_type: mimeType,
    });

    if (error) throw error;
}

/**
 * Since the bucket is private, use this whenever you need to actually
 * hand a file's URL to something (e.g. sending it back, or admin review).
 * Signed URLs expire — default 1 hour here.
 */
export async function getSignedFileUrl(storagePath, expiresInSeconds = 3600) {
    const { data, error } = await supabase.storage
        .from("user-files")
        .createSignedUrl(storagePath, expiresInSeconds);

    if (error) throw error;
    return data.signedUrl;
}
