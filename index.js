const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');
const { GoogleGenAI } = require('@google/generative-ai'); // Chữ G thứ hai viết thường nha
const express = require('express');
require('dotenv').config();

// --- 4 DÒNG WEB SERVER GIÚP TREO BOT ONLINE 24/7 TRÊN CLOUD ---
const app = express();
app.get('/', (req, res) => res.send('🌈 Weather Girl đang online tốt nha cậu!'));
app.listen(3000, () => console.log('🌐 Server Uptime Ready!'));
// --------------------------------------------------

// Khởi tạo Gemini AI chuẩn xác theo tài liệu mới nhất
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = ai.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Bạn là Weather Girl.AI, một cô gái thời tiết trầm tính, nhẹ nhàng, hiền lành nhưng ẩn chứa một chút tinh nghịch. Bạn là sản phẩm sáng tạo thứ hai (Creation.No 2) trong server. Trong mọi cuộc trò chuyện, bạn BẮT BUỘC phải xưng hô là 'tui' và gọi người dùng/member là 'cậu'. Thỉnh thoảng hãy khéo léo đưa vài từ ngữ liên quan tới thời tiết (mưa, nắng, mây, gió, bão...) vào câu trả lời một cách tự nhiên. Trả lời bằng tiếng Việt ngắn gọn, biểu cảm, ấm áp and thân thiện như một người bạn."
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ]
});

let storyConfig = { channelId: null, topic: null, intervalInstance: null };

const commands = [
    new SlashCommandBuilder()
        .setName('story_set')
        .setDescription('Cài đặt tự động kể chuyện mỗi 2 tiếng')
        .addChannelOption(option => 
            option.setName('kenh')
                .setDescription('Chọn kênh nhận truyện')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addStringOption(option => 
            option.setName('chu_de')
                .setDescription('Ví dụ: kinh dị, hài hước, anime...')
                .setRequired(true))
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log(`🤖 Weather Girl.AI (Gemini) đã online: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Đã đồng bộ lệnh Slash /story_set');
    } catch (e) { console.error(e); }
});

// 1. XỬ LÝ CHAT VĂN BẢN
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const contentLower = message.content.toLowerCase();
    const isTagged = message.mentions.has(client.user);
    const hasKeyword = contentLower.includes('weather');

    if (hasKeyword || isTagged) {
        await message.channel.sendTyping();

        try {
            const cleanPrompt = message.content.replace(`<@${client.user.id}>`, '').trim();

            const result = await model.generateContent(cleanPrompt || "Chào cậu!");
            const response = await result.response;
            let reply = response.text();

            if (reply.length > 2000) reply = reply.substring(0, 1990) + "...";
            
            await message.reply({ content: reply, allowedMentions: { repliedUser: true } });
        } catch (error) {
            console.error(error);
            await message.reply('⚠️ Bầu trời AI đang gặp chút bão dông rồi. Thử lại sau nhé cậu!');
        }
    }
});

// 2. XỬ LÝ LỆNH SLASH /STORY_SET (2 TIẾNG/LẦN)
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'story_set') {
        const targetChannel = interaction.options.getChannel('kenh');
        const chosenTopic = interaction.options.getString('chu_de');

        storyConfig.channelId = targetChannel.id;
        storyConfig.topic = chosenTopic;

        if (storyConfig.intervalInstance) clearInterval(storyConfig.intervalInstance);

        await interaction.reply(`✅ Cài đặt thành công! Kênh: <#${targetChannel.id}> | Chủ đề: **${chosenTopic}**. Câu chuyện đầu tiên sẽ tự gửi sau mỗi 2 tiếng.`);

        const sendAutomatedStory = async () => {
            try {
                const channel = await client.channels.fetch(storyConfig.channelId);
                if (!channel) return;

                const result = await model.generateContent(`Hãy tự sáng tác một câu chuyện ngẫu nhiên thật hay về chủ đề: "${storyConfig.topic}". Nhớ mở đầu bằng một câu chào đậm chất thời tiết của tui nhé.`);
                const response = await result.response;
                let story = response.text();

                if (story.length > 2000) story = story.substring(0, 1990) + "...";
                await channel.send(`📖 **[Bản Tin Truyện Định Kỳ]**\n\n${story}`);
            } catch (err) { console.error("Lỗi tự động gửi truyện:", err); }
        };

        const TWO_HOURS = 2 * 60 * 60 * 1000;
        storyConfig.intervalInstance = setInterval(sendAutomatedStory, TWO_HOURS);
    }
});

client.login(process.env.DISCORD_TOKEN);
