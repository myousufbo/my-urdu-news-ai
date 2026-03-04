require('dotenv').config();
const Parser = require('rss-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const parser = new Parser();

// Paths
const DATA_DIR = path.join(__dirname, 'data');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');

// List of RSS feeds to scrape
const RSS_FEEDS = [
    { url: 'http://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World', category: 'world' },
    { url: 'http://rss.cnn.com/rss/cnn_tech.rss', source: 'CNN Tech', category: 'tech' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera', category: 'world' }
];

async function translateWithGemini(text) {
    if (!text) return "";
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const prompt = `Translate the following English news text into clear, journalistic, and fluent Urdu. Do not add any extra commentary, just provide the translation.\n\nText: "${text}"\n\nUrdu Translation:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("Gemini Translation Error:", error);
        return text; // Return original if failed
    }
}

async function fetchAndProcessNews() {
    console.log("Starting news fetch process...");

    // Load existing news to avoid duplicates
    let existingNews = [];
    if (fs.existsSync(NEWS_FILE)) {
        const rawData = fs.readFileSync(NEWS_FILE);
        existingNews = JSON.parse(rawData);
    }

    const newArticles = [];

    for (const feed of RSS_FEEDS) {
        console.log(`Fetching from: ${feed.source}`);
        try {
            const parsedFeed = await parser.parseURL(feed.url);

            // Only process the top 3 latest items from each feed to save API calls during demo
            const latestItems = parsedFeed.items.slice(0, 3);

            for (const item of latestItems) {
                // Check if already completely processed based on link
                const exists = existingNews.some(n => n.link === item.link);
                if (exists) {
                    console.log(`Skipping existing: ${item.title}`);
                    continue;
                }

                console.log(`Processing new article: ${item.title}`);

                // Clean summary (remove HTML tags if any)
                let cleanSummary = item.contentSnippet || item.content || item.summary || "";
                cleanSummary = cleanSummary.replace(/<[^>]*>?/gm, '').substring(0, 500);

                // Translate using Gemini Pro
                const urduTitle = await translateWithGemini(item.title);
                const urduSummary = await translateWithGemini(cleanSummary);

                // Extract image (optional, basic logic)
                let imageUrl = null;
                if (item.enclosure && item.enclosure.url && item.enclosure.url.match(/\.(jpeg|jpg|gif|png)$/)) {
                    imageUrl = item.enclosure.url;
                }

                const newArticle = {
                    id: item.guid || item.link,
                    originalTitle: item.title,
                    urduTitle: urduTitle,
                    urduSummary: urduSummary,
                    source: feed.source,
                    link: item.link,
                    pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
                    category: feed.category,
                    imageUrl: imageUrl
                };

                newArticles.push(newArticle);
            }
        } catch (error) {
            console.error(`Failed to fetch/parse feed ${feed.url}:`, error.message);
        }
    }

    if (newArticles.length > 0) {
        console.log(`Saving ${newArticles.length} new articles...`);
        // Prepend new articles and keep a max array size (e.g., 50)
        const updatedNews = [...newArticles, ...existingNews].slice(0, 50);

        // Ensure data dir exists
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR);
        }

        fs.writeFileSync(NEWS_FILE, JSON.stringify(updatedNews, null, 2));
        console.log("Data successfully saved to news.json!");
    } else {
        console.log("No new articles to process.");
    }
}

// Execute
fetchAndProcessNews();
