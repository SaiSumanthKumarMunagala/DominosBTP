/**
 * Twilio SMS client.
 * Drop this file into: srv/utils/twilio-client.js
 *
 * Requires: npm install twilio
 * Set in your .env file:
 *   TWILIO_ACCOUNT_SID=AC...
 *   TWILIO_AUTH_TOKEN=...
 *   TWILIO_FROM_NUMBER=+1...
 */

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

let client = null;

if (accountSid && authToken) {
    try {
        client = require('twilio')(accountSid, authToken);
        console.log('[TWILIO] Client initialized');
    } catch (e) {
        console.error('[TWILIO] Failed to initialize:', e.message);
    }
} else {
    console.warn('[TWILIO] Credentials not set — SMS will use mock mode');
}

module.exports = {

    async sendSMS({ to, body }) {
        if (!client) {
            console.log(`[MOCK-SMS] To: ${to} | Message: ${body}`);
            return {
                success: true,
                messageId: `MOCK-${Date.now()}`,
                status: 'mock'
            };
        }

        try {
            const message = await client.messages.create({
                from: fromNumber,
                to: to,
                body: body
            });

            console.log(`[TWILIO-SMS] Sent to ${to}: ${message.sid} (${message.status})`);
            return {
                success: true,
                messageId: message.sid,
                status: message.status
            };
        } catch (err) {
            console.error('[TWILIO-SMS] Error:', err.message);
            return {
                success: false,
                messageId: null,
                error: err.message
            };
        }
    }
};
