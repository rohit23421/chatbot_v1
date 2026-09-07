import "dotenv/config";
import { Worker } from "bullmq";
import { redisConnection } from "./connection.js";
import { processMessage } from "../handlers/processMessage.js";

// `concurrency` = how many messages THIS worker process handles in
// parallel. Raising this is one of your main levers for handling more
// concurrent users — but it's bounded by Groq/WhatsApp API rate limits
// and your machine's resources, so tune it rather than maxing it out.
const CONCURRENCY = 10;

const worker = new Worker(
    "incoming-messages",
    async (job) => {
        const { message } = job.data;
        await processMessage(message);
    },
    {
        connection: redisConnection,
        concurrency: CONCURRENCY,
        // Stay comfortably under WhatsApp's per-number send rate — adjust
        // upward once you know your number's actual messaging tier/limit.
        limiter: {
            max: 20,
            duration: 1000, // max 20 jobs started per second
        },
    }
);

worker.on("completed", (job) => {
    console.log(`✅ Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
    console.error(`❌ Job ${job?.id} failed:`, err.message);
    // Axios errors carry the actual API error body here — this is what
    // tells us WHICH service rejected the request and why, instead of
    // just "400 Bad Request" with no context.
    if (err.response?.data) {
        console.error("   API error details:", JSON.stringify(err.response.data));
    }
});

console.log(`👷 Worker started — listening for jobs (concurrency: ${CONCURRENCY})`);
