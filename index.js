const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = "Bạn là Weather Girl.AI, một cô gái thời tiết trầm tính, nhẹ nhàng, hiền lành nhưng ẩn chứa một chút tinh nghịch. Bạn là sản phẩm sáng tạo thứ hai (Creation.No 2) trong server. Trong mọi cuộc trò chuyện, bạn BẮT BUỘC phải xưng hô là 'tui' và gọi người dùng/member là 'cậu'. Thỉnh thoảng hãy khéo léo đưa vài từ ngữ liên quan tới thời tiết (mưa, nắng, mây, gió, bão...) vào câu trả lời một cách tự nhiên. Trả lời bằng tiếng Việt ngắn gọn, biểu cảm, ấm áp và thân thiện như một người bạn.";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ]
});

let storyConfig = { 
    channelId: null, 
    topic: null, 
    intervalInstance: null 
};

const RANDOM_TOPICS = [
    "phiêu lưu kỳ ảo", 
    "đời thường nhẹ nhàng", 
    "bí ẩn, trinh thám", 
    "cổ tích hiện đại", 
    "anime học đường", 
    "khoa học viễn tưởng", 
    "kinh dị nhẹ nhàng", 
    "hài hước, vui nhộn"
];

const commands = [
    new SlashCommandBuilder()
        .setName('story_set')
        .setDescription('Cài đặt tự động kể chuyện ngẫu nhiên mỗi 2 tiếng')
        .addChannelOption(option => 
            option.setName('kenh')
                .setDescription('Chọn kênh nhận truyện')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log(`🤖 Weather Girl.AI (Gemini) đã online: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Đã đồng bộ lệnh Slash /story_set');
    } catch (e) { 
        console.error('❌ Lỗi đồng bộ lệnh Slash:', e); 
    }
});

const sendAutomatedStory = async () => {
    if (!storyConfig.channelId) return;
    try {
        const channel = await client.channels.fetch(storyConfig.channelId);
        if (!channel) return;

        const activeTopic = storyConfig.topic || RANDOM_TOPICS[Math.floor(Math.random() * RANDOM_TOPICS.length)];

        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: `Hãy tự sáng tác một câu chuyện thật hay và cuốn hút về chủ đề: "${activeTopic}". Nhớ mở đầu bằng một câu chào đậm chất thời tiết của tui nhé.`,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION
            }
        });

        let story = response.text;
        if (story.length > 2000) story = story.substring(0, 1990) + "...";

        await channel.send(`📖 **[Bản Tin Truyện Định Kỳ | Chủ đề: ${activeTopic}]**\n\n${story}`);
    } catch (err) { 
        console.error("❌ Lỗi tự động gửi truyện:", err); 
    }
};

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const contentLower = message.content.toLowerCase();
    const isTagged = message.mentions.has(client.user);
    const hasKeyword = contentLower.includes('weather');

    if (hasKeyword || isTagged) {
        await message.channel.sendTyping();

        try {
            const cleanPrompt = message.content.replace(/<@!?\d+>/g, '').trim();

            // Kiểm tra yêu cầu trả về chủ đề ngẫu nhiên
            const isRandomRequest = /(ngẫu nhiên|random)/i.test(cleanPrompt);
            if (isRandomRequest && storyConfig.channelId) {
                storyConfig.topic = null;
                await message.reply({ 
                    content: `🌈 Okela cậu! Tui đã chuyển lại sang chế độ chọn chủ đề **ngẫu nhiên** rồi nha. Đồng hồ 2 tiếng vẫn chạy tiếp bình thường nhé!`, 
                    allowedMentions: { repliedUser: true } 
                });
                return;
            }

            // Kiểm tra yêu cầu đổi sang một chủ đề cụ thể
            const isStoryRequest = /(kể chuyện|chủ đề|đổi truyện|truyện về|kể về)/i.test(cleanPrompt);
            if (isStoryRequest && storyConfig.channelId) {
                const extractTopic = await ai.models.generateContent({
                    model: "gemini-3.8-flash",
                    contents: `Trích xuất ngắn gọn cụm từ chỉ chủ đề câu chuyện từ câu sau (chỉ trả về đúng tên chủ đề, tối đa 6 từ, không giải thích thêm): "${cleanPrompt}"`
                });

                const newTopic = extractTopic.text.trim().replace(/[".]/g, '');
                storyConfig.topic = newTopic;

                await message.reply({ 
                    content: `🌤️ Tui đã ghi nhận chủ đề mới là **"${newTopic}"** rồi nha cậu! Đồng hồ đếm ngược 2 tiếng vẫn chạy bình thường, tới lượt kể tiếp theo tui sẽ kể theo chủ đề này nhé.`, 
                    allowedMentions: { repliedUser: true } 
                });
                return;
            }

            // Trò chuyện bình thường
            const response = await ai.models.generateContent({
                model: "gemini-3.8-flash",
                contents: cleanPrompt || "Chào cậu!",
                config: {
                    systemInstruction: SYSTEM_INSTRUCTION
                }
            });

            let reply = response.text;
            if (reply.length > 2000) reply = reply.substring(0, 1990) + "...";
            
            await message.reply({ content: reply, allowedMentions: { repliedUser: true } });
        } catch (error) {
            console.error('❌ Lỗi gọi Gemini:', error);
            await message.reply('⚠️ Bầu trời AI đang gặp chút bão dông rồi. Thử lại sau nhé cậu!');
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'story_set') {
        const targetChannel = interaction.options.getChannel('kenh');

        storyConfig.channelId = targetChannel.id;
        storyConfig.topic = null;

        if (storyConfig.intervalInstance) clearInterval(storyConfig.intervalInstance);

        await interaction.reply(`✅ Đã cài đặt kênh nhận truyện: <#${targetChannel.id}>! Tui sẽ tự động kể chuyện với các chủ đề **ngẫu nhiên** sau mỗi **2 tiếng**. Muốn đổi chủ đề hoặc quay lại ngẫu nhiên, cậu chỉ cần tag tui hoặc gọi "weather" nhé.`);

        const TWO_HOURS = 2 * 60 * 60 * 1000;
        storyConfig.intervalInstance = setInterval(sendAutomatedStory, TWO_HOURS);
    }
});

console.log('⏳ Đang kết nối tới Discord...');
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ LỖI: Chưa tìm thấy biến môi trường DISCORD_TOKEN!');
} else {
    client.login(process.env.DISCORD_TOKEN)
        .catch(err => console.error('❌ Lỗi đăng nhập Discord:', err));
}
