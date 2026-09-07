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

// Keep the extracted text within a safe size — very long PDFs could
// otherwise blow past the model's context window or take too long/cost
// too much. This caps it at roughly ~12k characters (~3k tokens).
const MAX_DOCUMENT_CHARS = 12000;

/**
 * Summarizes extracted PDF text into something useful over WhatsApp:
 * a short summary, key points/KPIs if present, and nothing else fluffy.
 */
export async function summarizeDocument(extractedText) {
    const truncated = extractedText.slice(0, MAX_DOCUMENT_CHARS);
    const wasTruncated = extractedText.length > MAX_DOCUMENT_CHARS;

    const messages = [
        {
            role: "system",
            content:
                "You analyze documents and produce concise WhatsApp-friendly summaries. " +
                "Structure your reply as: a 2-3 sentence summary, then a short bulleted list " +
                "of key points or KPIs/numbers if the document contains any, using plain " +
                "hyphens for bullets (no markdown headers, no bold). Keep it tight — this " +
                "is read on a phone.",
        },
        {
            role: "user",
            content: `Here is the document text${wasTruncated ? " (truncated, this is the beginning of a longer document)" : ""}:\n\n${truncated}`,
        },
    ];

    const response = await axios.post(
        GROQ_URL,
        {
            model: "openai/gpt-oss-120b",
            messages,
            temperature: 0.3, // lower temperature — this should be factual, not creative
            max_tokens: 500,
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
