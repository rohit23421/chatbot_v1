import { Queue } from "bullmq";
import { redisConnection } from "./connection.js";

export const messageQueue = new Queue("incoming-messages", {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3, // retry a failed job (e.g. transient Supabase/Groq error) up to 3 times
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 1000, // keep last 1000 completed jobs for debugging, then drop
        removeOnFail: 5000,
    },
});
