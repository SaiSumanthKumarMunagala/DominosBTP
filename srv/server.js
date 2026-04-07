/**
 * Server bootstrap — REPLACE srv/server.js with this file
 */

require('dotenv').config();
const cds = require('@sap/cds');

cds.on('served', () => {
    console.log('═══════════════════════════════════════');
    console.log('  Domino\'s CAP Server Running');
    console.log('═══════════════════════════════════════');
    console.log('  Stripe:  ' + (process.env.STRIPE_SECRET_KEY ? '✓ Connected' : '✗ Mock mode'));
    console.log('  Twilio:  ' + (process.env.TWILIO_ACCOUNT_SID ? '✓ Connected' : '✗ Mock mode'));
    console.log('═══════════════════════════════════════');
});

module.exports = cds.server;
