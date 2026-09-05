import "dotenv/config";

export const config = {
    port: process.env.PORT || 3000,
    whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    whatsappToken: process.env.WHATSAPP_TOKEN,
    whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
    redisUrl: process.env.REDIS_URL,
};
