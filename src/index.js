require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const proxyServiceSid = process.env.TWILIO_PROXY_SERVICE_SID;
const twilioClient = twilio(accountSid, authToken);

// Create a Proxy Session
async function createSession() {
    try {
        const session = await twilioClient.proxy.v1.services(proxyServiceSid).sessions.create();
        console.log(`Session created: ${session.sid}`);
        return session.sid;
    } catch (error) {
        console.error("Error creating session:", error.message);
    }
}

// Add a Participant to the Session
async function addParticipant(sessionSid, phoneNumber, alias) {
    try {
        const participant = await twilioClient.proxy.v1.services(proxyServiceSid)
            .sessions(sessionSid)
            .participants.create({
                friendlyName: alias,
                identifier: phoneNumber,
            });
        console.log(`${alias} added with Proxy Number: ${participant.proxyIdentifier}`);
        return participant.proxyIdentifier;
    } catch (error) {
        console.error(`Error adding ${alias}:`, error.message);
    }
}

// Initialize and create session for a client and content producer
app.post("/start-session", async (req, res) => {
    try {
        const sessionSid = await createSession();
        const clientProxy = await addParticipant(sessionSid, process.env.CLIENT_PHONE_NUMBER, "Client");
        const cpProxy = await addParticipant(sessionSid, process.env.CONTENT_PRODUCER_PHONE_NUMBER, "Content Producer");

        res.json({
            message: "Session started successfully.",
            sessionSid, 
            clientProxyNumber: clientProxy,
            contentProducerProxyNumber: cpProxy
        });
    } catch (error) {
        res.status(500).send(`Error starting session: ${error.message}`);
    }
});

// Close session
app.post("/end-session", async (req, res) => {
    const { sessionSid } = req.body;
    if (!sessionSid) return res.status(400).send("Session SID required.");

    try {
        await twilioClient.proxy.v1.services(proxyServiceSid)
            .sessions(sessionSid)
            .remove();
        res.send("Session ended.")
    } catch (error) {
        res.status(500).send(`Error ending session: ${error.message}`);
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
})