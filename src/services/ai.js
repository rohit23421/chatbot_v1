import axios from "axios";
import { config } from "../config.js";

// Groq's API is OpenAI-compatible — same request/response shape,
// just a different base URL, key, and model name.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Turns stored demographics (jsonb from the users table) into a short
 * line the model can use to personalize its tone/content — without
 * this being the whole point of the prompt.
 */
function buildSystemPrompt(demographics = {}) {
    const knownFacts = Object.entries(demographics)
        .filter(([, value]) => value)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");

    return [
        "You are a helpful WhatsApp business assistant.",
        "Keep replies short and conversational — this is a chat app, not email.",
        knownFacts
            ? `Known info about this user: ${knownFacts}. Use it naturally if relevant, don't just repeat it back.`
            : "",
    ]
        .filter(Boolean)
        .join(" ");
}

/**
 * recentMessages: array of { role: 'user' | 'assistant', content } in
 * chronological order (oldest first) — this IS the memory being fed in.
 */
export async function generateReply({ recentMessages, demographics }) {
    const messages = [
        { role: "system", content: buildSystemPrompt(demographics) },
        ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const response = await axios.post(
        GROQ_URL,
        {
            model: "openai/gpt-oss-120b",
            messages,
            temperature: 0.7,
            max_tokens: 300,
        },
        {
            headers: {
                Authorization: `Bearer ${config.groqApiKey}`,
                "Content-Type": "application/json",
            },
        }
    );

    return response.data.choices[0].message.content.trim();
}
