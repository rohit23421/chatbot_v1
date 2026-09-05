import { Router } from "express";
import { config } from "../config.js";
import { messageQueue } from "../queue/queue.js";

export const webhookRouter = Router();

/**
 * Meta calls this ONCE when you save the webhook URL in the dashboard,
 * to prove you own this server. You must echo back "hub.challenge"
 * if the verify token matches what you set in .env.
 */
webhookRouter.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === config.whatsappVerifyToken) {
        console.log("✅ Webhook verified by Meta");
        return res.status(200).send(challenge);
    }

    console.log("❌ Webhook verification failed — token mismatch");
    return res.sendStatus(403);
});

/**
 * Meta calls this every time a message/status update happens.
 *
 * This route now does almost nothing: validate the shape, push the raw
 * message onto the queue, and respond 200 immediately. All the real work
 * (Supabase, Groq, WhatsApp send) happens in src/queue/worker.js, running
 * as a SEPARATE process. This is what lets many messages be handled in
 * parallel instead of one at a time, and keeps this endpoint always fast
 * regardless of how slow the AI/DB calls are.
 */
webhookRouter.post("/webhook", async (req, res) => {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    // Always ack Meta fast, even for status updates / empty payloads.
    res.sendStatus(200);

    if (!message) {
        console.log("ℹ️ Webhook event with no message (likely a status update)");
        return;
    }

    try {
        await messageQueue.add("process-message", { message });
        console.log(`📥 Queued message from ${message.from} (type: ${message.type})`);
    } catch (err) {
        console.error("❌ Failed to enqueue message:", err);
    }
});
