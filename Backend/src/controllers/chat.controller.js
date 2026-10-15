import { generateResponse } from "../services/ai.service.js";
import chatModel from "../models/chat.model.js"
import messageModel from "../models/message.model.js";

export async function sendMessage(req, res) {

    const { message, chat: chatId } = req.body;


    let title = null, chat = null;

    if (!chatId) {
        title = message.trim().split(/\s+/).slice(0, 6).join(" ").slice(0, 60);
        chat = await chatModel.create({
            user: req.user.id,
            title
        })
    }

    const userMessage = await messageModel.create({
        chat: chatId || chat._id,
        content: message,
        role: "user"
    })

    const messages = await messageModel.find({ chat: chatId || chat._id })

    let result;
    try {
        result = await generateResponse(messages);
    } catch (error) {
        await userMessage.deleteOne();
        if (!chatId) {
            await chat.deleteOne();
        }

        const isRateLimited = error?.status === 429
            || error?.statusCode === 429
            || error?.response?.status === 429
            || error?.code === "1300"
            || /rate limit exceeded/i.test(error?.message ?? "");

        console.error("AI response generation failed:", error?.message ?? error);
        return res.status(isRateLimited ? 429 : 502).json({
            message: isRateLimited
                ? "The AI provider is rate-limited right now. Please wait a moment and try again."
                : "The AI provider could not generate a response. Please try again.",
            success: false,
            code: isRateLimited ? "AI_RATE_LIMITED" : "AI_PROVIDER_ERROR"
        });
    }

    const aiMessage = await messageModel.create({
        chat: chatId || chat._id,
        content: result,
        role: "ai"
    })


    res.status(201).json({
        title,
        chat,
        aiMessage
    })

}

export async function getChats(req, res) {
    const user = req.user

    const chats = await chatModel.find({ user: user.id })

    res.status(200).json({
        message: "Chats retrieved successfully",
        chats
    })
}

export async function getMessages(req, res) {
    const { chatId } = req.params;

    const chat = await chatModel.findOne({
        _id: chatId,
        user: req.user.id
    })

    if (!chat) {
        return res.status(404).json({
            message: "Chat not found"
        })
    }

    const messages = await messageModel.find({
        chat: chatId
    })

    res.status(200).json({
        message: "Messages retrieved successfully",
        messages
    })
}

export async function deleteChat(req, res) {

    const { chatId } = req.params;

    const chat = await chatModel.findOneAndDelete({
        _id: chatId,
        user: req.user.id
    })

    await messageModel.deleteMany({
        chat: chatId
    })

    if (!chat) {
        return res.status(404).json({
            message: "Chat not found"
        })
    }

    res.status(200).json({
        message: "Chat deleted successfully"
    })
}