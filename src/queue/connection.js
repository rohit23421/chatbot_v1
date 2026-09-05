import IORedis from "ioredis";
import { config } from "../config.js";

// BullMQ requires maxRetriesPerRequest: null on the connection it's given —
// this is a hard BullMQ requirement, not optional.
export const redisConnection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
});
