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
const twilioClient = twilio(accountSid, authToken);
const CONVERSATIONS_SERVICE_SID = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

// Create a new masked conversation
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
async function addParticipant(conversationSid, userPhoneNumber) {
    try {
        await twilioClient.conversations.v1.conversations(conversationSid)
            .participants
            .create({
                messagingBinding: {
                    address: userPhoneNumber,
                    proxyAddress: process.env.TWILIO_PHONE_NUMBER
                }
            });
        console.log(`Adding ${userPhoneNumber} to conversation ${conversationSid}`);
    } catch (error) {
        console.error("Error adding participant:", error);
    }
}

// API to start a new masked conversation between a Client and CP
app.post("/start-conversation", async(req, res) => {
    const { clientPhone, contentProducerPhone } = req.body;

    if (!clientPhone || !contentProducerPhone) {
        return res.status(400).send("Both clientPhone and contentProducerPhone are required.");
    }

    try {
        const conversationSid = await createConversation();
        await addParticipant(conversationSid, clientPhone);
        await addParticipant(conversationSid, contentProducerPhone);

        res.json({ message: "Conversation started", conversationSid });
    } catch (error) {
        res.status(500).send(`Error: ${error.message}`);
    }
});

// Webhook to handle incoming messages
app.post("/incoming", async (req, res) => {
    const { From, Body, ConversationSid } = req.body;

    // Check if ConversationSid and message body exist
    if (!ConversationSid || !Body || !From) {
        return res.status(400).send("Invalid message or missing ConversationSid.");
    }

    try {
        // Find the participant (either Content Producer or Client)
        const participant = await twilioClient.conversations.v1.conversations(ConversationSid)
            .participants
            .list({ limit: 1 }); // Assume there's one participant for simplicity

        // Determine the recipient based on sender's phone number
        const senderPhone = From;
        const senderIsClient = participant[0].messagingBinding.address === senderPhone;
        const recipientPhone = senderIsClient ? "Content Producer" : "Client";

        // Forward the message to the other participant
        const messageSent = await twilioClient.conversations.v1.conversations(ConversationSid)
            .messages
            .create({
                body: Body,
                from: senderPhone, // This sends the message back to the other participant
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