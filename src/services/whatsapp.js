import axios from "axios";
import { config } from "../config.js";

const GRAPH_API_BASE = "https://graph.facebook.com/v20.0";

/**
 * Sends a plain text reply back to a user via the WhatsApp Cloud API.
 */
export async function sentTextMessage(toWaId, text) {
    const url = `${GRAPH_API_BASE}/${config.whatsappPhoneNumberId}/messages`;

    await axios.post(
        url,
        {
            messaging_product: "whatsapp",
            to: toWaId,
            type: "text",
            text: { body: text },
        },
        {
            headers: {
                Authorization: `Bearer ${config.whatsappToken}`,
                "Content-Type": "application/json",
            },
        }
    );
}

/**
 * Step 1 of receiving a file: WhatsApp only sends you a media ID in the
 * webhook payload, not the file itself. You have to ask Meta for a
 * temporary download URL using that ID.
 */
export async function getMediaUrl(mediaId) {
    const url = `${GRAPH_API_BASE}/${mediaId}`;
    const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${config.whatsappToken}` },
    });
    // response.data looks like: { url, mime_type, sha256, file_size, id }
    return response.data;
}

/**
 * Step 2: the URL from getMediaUrl() is temporary and still requires
 * your access token to actually fetch the bytes — download it as a Buffer.
 */
export async function downloadMedia(mediaDownloadUrl) {
    const response = await axios.get(mediaDownloadUrl, {
        headers: { Authorization: `Bearer ${config.whatsappToken}` },
        responseType: "arraybuffer",
    });
    return Buffer.from(response.data);
}
