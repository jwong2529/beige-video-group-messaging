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

// In-memory storage for conversation mappings (replace with a database in production)
const conversations = {};

// Endpoint to start a conversation between a Client and a Content Producer
app.post('/start-conversation', async (req, res) => {
    const { clientNumber, contentProducerNumber } = req.body;

    if (!clientNumber || !contentProducerNumber) {
        return res.status(400).json({ error: 'Client and Content Producer numbers are required.' });
    }

    try {
        // Create a new conversation
        const conversation = await twilioClient.conversations.v1.conversations.create({
            friendlyName: 'Client-ContentProducer Chat',
        });

        // Add the Client and Content Producer to the conversation
        await twilioClient.conversations.v1
            .conversations(conversation.sid)
            .participants.create({
                'messagingBinding.address': clientNumber,
                'messagingBinding.proxyAddress': twilioPhoneNumber,
            });

        await twilioClient.conversations.v1
            .conversations(conversation.sid)
            .participants.create({
                'messagingBinding.address': contentProducerNumber,
                'messagingBinding.proxyAddress': twilioPhoneNumber,
            });

        // Store the conversation SID and participant numbers in memory
        conversations[conversation.sid] = {
            clientNumber,
            contentProducerNumber,
        };

        res.status(200).json({
            message: 'Conversation started successfully!',
            conversationSid: conversation.sid,
        });
    } catch (error) {
        console.error('Error starting conversation:', error);
        res.status(500).json({ error: 'Failed to start conversation.' });
    }
});

// Endpoint to handle incoming messages from Twilio
app.post('/incoming-message', async (req, res) => {
    const from = req.body.From;
    const to = req.body.To;
    const body = req.body.Body;

    // Find the conversation SID based on the sender's number
    const conversationSid = Object.keys(conversations).find((sid) => {
        const conversation = conversations[sid];
        return conversation.clientNumber === from || conversation.contentProducerNumber === from;
    });

    if (!conversationSid) {
        return res.status(404).json({ error: 'Conversation not found.' });
    }

    // Determine the recipient
    const conversation = conversations[conversationSid];
    const recipientNumber =
        from === conversation.clientNumber
            ? conversation.contentProducerNumber
            : conversation.clientNumber;

    // Send the message to the recipient via Twilio
    try {
        await twilioClient.messages.create({
            body: body,
            from: twilioPhoneNumber,
            to: recipientNumber,
        });

        res.status(200).json({ message: 'Message forwarded successfully!' });
    } catch (error) {
        console.error('Error forwarding message:', error);
        res.status(500).json({ error: 'Failed to forward message.' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
})