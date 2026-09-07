import express from "express"
import { config } from "./config.js"
import { webhookRouter } from "./routes/webhook.js";

const app = express();

// whatspapp sends json payloads
app.use(express.json());

app.get("/", (req, res) => {
    console.log("WHATSAPP BOT SERVER UP AND RUNNING");

    res.send("Whatsapp bot server is running");
})

app.use("/", webhookRouter)

app.listen(config.port, () => {
    console.log(`🚀 Server listening on http://localhost:${config.port}`);

})