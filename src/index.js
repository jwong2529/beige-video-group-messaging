require('dotenv').config({ path: '../.env' });
const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = twilio(accountSid, authToken);
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const CONVERSATIONS_SERVICE_SID = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

/// Create a new masked conversation
async function createConversation() {
    try {
        const conversation = await twilioClient.conversations.v1.conversations.create({
            friendlyName: "Anonymized Client-Producer Chat"
        });
        console.log("Conversation Created:", conversation.sid);
        return conversation.sid;
    } catch (error) {
        console.error("Error creating conversation:", error);
    }
}

// Add a participant (Client or Content Producer)
async function addParticipant(conversationSid, userPhoneNumber, identity) {
    try {
        await twilioClient.conversations.v1.conversations(conversationSid)
            .participants
            .create({
                messagingBinding: {
                    address: userPhoneNumber,
                    proxyAddress: twilioPhoneNumber
                },
                identity: identity  // Add identity (a unique user identifier)
            });
        console.log(`Added ${userPhoneNumber} (identity: ${identity}) to conversation ${conversationSid}`);
    } catch (error) {
        console.error("Error adding participant:", error);
    }
}

// API to start a new masked conversation between a Client and CP
app.post("/start-conversation", async (req, res) => {
    const { clientPhone, contentProducerPhone } = req.body;

    if (!clientPhone || !contentProducerPhone) {
        return res.status(400).send("Both clientPhone and contentProducerPhone are required.");
    }

    try {
        const conversationSid = await createConversation();
        await addParticipant(conversationSid, clientPhone, "client_" + clientPhone);
        await addParticipant(conversationSid, contentProducerPhone, "cp_" + contentProducerPhone);

        res.json({ message: "Conversation started", conversationSid });
    } catch (error) {
        res.status(500).send(`Error: ${error.message}`);
    }
});

// Webhook to handle incoming messages
app.post("/incoming", async (req, res) => {
    const { From, Body, ConversationSid } = req.body;

    if (!ConversationSid || !Body || !From) {
        return res.status(400).send("Invalid message or missing ConversationSid.");
    }

    try {
        // Fetch participants in the conversation
        const participants = await twilioClient.conversations.v1.conversations(ConversationSid)
            .participants
            .list({ limit: 10 });

        if (!participants.length) {
            console.error("No participants found in the conversation.");
            return res.status(404).send("No participants found in the conversation.");
        }

        // Find sender and determine recipient
        const sender = participants.find(p => p.messagingBinding?.address === From);
        if (!sender) {
            return res.status(400).send("Sender not found in conversation.");
        }

        const recipient = participants.find(p => p.messagingBinding?.address !== From);
        if (!recipient) {
            return res.status(400).send("Recipient not found in conversation.");
        }

        // Forward message
        const messageSent = await twilioClient.conversations.v1.conversations(ConversationSid)
            .messages
            .create({
                body: Body,
                author: sender.identity  // Use identity instead of 'from'
            });

        res.json({ message: "Message forwarded.", sid: messageSent.sid });
    } catch (error) {
        console.error("Error processing incoming message:", error);
        res.status(500).send(`Error: ${error.message}`);
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
})