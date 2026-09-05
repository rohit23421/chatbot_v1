import {
    getOrCreateUser,
    getOrCreateConversation,
    saveMessage,
    getRecentMessages,
    uploadFileToStorage,
    saveFileRecord,
    saveOnboardingAnswer,
} from "../services/supabase.js";
import {
    sentTextMessage,
    getMediaUrl,
    downloadMedia,
} from "../services/whatsapp.js";
import { generateReply } from "../services/ai.js";
import {
    getFirstQuestion,
    getFieldForStep,
    getNextStep,
    getQuestionForStep,
} from "../services/onboarding.js";

const FILE_TYPES = ["document", "image", "audio", "video"];

/**
 * Single entry point the worker calls for every queued message.
 * Routes to the right handler based on message type.
 */
export async function processMessage(message) {
    if (message.type === "text") {
        await handleTextMessage(message);
        return;
    }

    if (FILE_TYPES.includes(message.type)) {
        await handleFileMessage(message);
        return;
    }

    console.log(`ℹ️ Received an unhandled message type (${message.type}) — skipping`);
}

async function handleTextMessage(message) {
    const waId = message.from;
    const incomingText = message.text.body;

    console.log(`📩 Message from ${waId}: "${incomingText}"`);

    // 1. Recognize (or create) this user — this is the "memory" identity.
    const { user, isNew } = await getOrCreateUser(waId);
    const conversation = await getOrCreateConversation(user.id);

    // 2. Brand new user: don't treat their first message as an onboarding
    // answer — just greet them and ask the first question.
    if (isNew) {
        const firstQuestion = getFirstQuestion();
        await sentTextMessage(waId, firstQuestion);
        await saveMessage({
            conversationId: conversation.id,
            userId: user.id,
            role: "assistant",
            content: firstQuestion,
        });
        console.log(`👋 New user ${waId} — sent first onboarding question`);
        return;
    }

    // 3. Existing user still mid-onboarding: this message IS the answer
    // to whatever question they were last asked.
    if (user.onboarding_step !== "done") {
        await handleOnboardingAnswer({ user, conversation, waId, incomingText });
        return;
    }

    // 4. Fully onboarded — normal AI conversation flow.
    await saveMessage({
        conversationId: conversation.id,
        userId: user.id,
        role: "user",
        content: incomingText,
    });

    const recentMessages = await getRecentMessages(user.id, 20);

    const replyText = await generateReply({
        recentMessages,
        demographics: user.demographics,
    });

    await sentTextMessage(waId, replyText);

    await saveMessage({
        conversationId: conversation.id,
        userId: user.id,
        role: "assistant",
        content: replyText,
    });

    console.log(`✅ Replied to ${waId} and saved both messages to Supabase`);
}

/**
 * Saves the answer to whatever onboarding step the user is currently on,
 * advances them to the next step, and asks the next question — or, if
 * that was the last question, wraps up onboarding.
 */
async function handleOnboardingAnswer({ user, conversation, waId, incomingText }) {
    const currentField = getFieldForStep(user.onboarding_step);
    const nextStep = getNextStep(user.onboarding_step);

    // Save their answer into demographics + advance the step.
    const updatedUser = await saveOnboardingAnswer({
        user,
        field: currentField,
        value: incomingText,
        nextStep,
    });

    // Log their answer as a normal message too, so it's part of history.
    await saveMessage({
        conversationId: conversation.id,
        userId: user.id,
        role: "user",
        content: incomingText,
    });

    const nextQuestion = getQuestionForStep(nextStep);

    const replyText = nextQuestion
        ? nextQuestion
        : "Thanks — you're all set! What can I help you with?";

    await sentTextMessage(waId, replyText);

    await saveMessage({
        conversationId: conversation.id,
        userId: updatedUser.id,
        role: "assistant",
        content: replyText,
    });

    console.log(
        `📝 ${waId} answered "${currentField}" — now on step "${nextStep}"`
    );
}

/**
 * Handles documents (PDFs, etc), images, audio, and video.
 * WhatsApp only sends a media ID in the webhook — we have to fetch a
 * temporary download URL, pull the bytes, then store them ourselves.
 */
async function handleFileMessage(message) {
    const waId = message.from;
    const media = message[message.type]; // e.g. message.document, message.image
    const mediaId = media.id;
    const caption = media.caption || "";

    console.log(`📎 ${message.type} received from ${waId} (media id: ${mediaId})`);

    const { user } = await getOrCreateUser(waId);
    const conversation = await getOrCreateConversation(user.id);

    // 1. Ask Meta for the actual download URL for this media ID.
    const mediaInfo = await getMediaUrl(mediaId);

    // 2. Download the real bytes.
    const fileBuffer = await downloadMedia(mediaInfo.url);

    // 3. Build a filename — documents include one, images/audio/video usually don't.
    const extension = mediaInfo.mime_type.split("/")[1] || "bin";
    const fileName = media.filename || `${message.type}-${Date.now()}.${extension}`;

    // 4. Upload to Supabase Storage (private bucket).
    const storagePath = await uploadFileToStorage({
        waId,
        fileName,
        buffer: fileBuffer,
        mimeType: mediaInfo.mime_type,
    });

    // 5. Save the message row (content = caption if any, or a placeholder).
    const savedMessage = await saveMessage({
        conversationId: conversation.id,
        userId: user.id,
        role: "user",
        content: caption || `[${message.type} received: ${fileName}]`,
        messageType: message.type,
        mediaUrl: storagePath,
    });

    // 6. Link it in the files table too.
    await saveFileRecord({
        userId: user.id,
        messageId: savedMessage.id,
        fileName,
        storagePath,
        mimeType: mediaInfo.mime_type,
    });

    // 7. Acknowledge receipt — keeping this simple for now, no AI analysis
    // of file contents yet (that's a further extension, not core Part 7).
    const ackText = caption
        ? `Got your ${message.type} — thanks!`
        : `Got your ${message.type} (${fileName}) — saved it.`;

    await sentTextMessage(waId, ackText);

    await saveMessage({
        conversationId: conversation.id,
        userId: user.id,
        role: "assistant",
        content: ackText,
    });

    console.log(`✅ Stored ${message.type} from ${waId} at ${storagePath}`);
}
