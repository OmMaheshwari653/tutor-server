import axios from "axios";

if (!process.env.YOUTUBE_API_KEY) {
  console.warn("⚠️ YOUTUBE_API_KEY not set - video features will be disabled");
}

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export interface YouTubeVideo {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  duration: string;
  viewCount: number;
  publishedAt: string;
}

// Search for educational videos related to a topic
export async function searchYouTubeVideos(params: {
  query: string;
  maxResults?: number;
  language?: string;
}): Promise<YouTubeVideo[]> {
  if (!YOUTUBE_API_KEY) {
    throw new Error("YouTube API key not configured");
  }

  const { query, maxResults = 5, language = "en" } = params;

  try {
    // Search for videos
    const searchResponse = await axios.get(`${YOUTUBE_API_BASE}/search`, {
      params: {
        key: YOUTUBE_API_KEY,
        q: `${query} tutorial explained`,
        part: "snippet",
        type: "video",
        maxResults,
        videoDuration: "medium", // 4-20 minutes
        videoDefinition: "high",
        relevanceLanguage: language === "Hindi" ? "hi" : "en",
        order: "relevance",
        safeSearch: "strict",
      },
    });

    const videoIds = searchResponse.data.items
      .map((item: any) => item.id.videoId)
      .join(",");

    if (!videoIds) {
      return [];
    }

    // Get video details (duration, views, etc.)
    const detailsResponse = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
      params: {
        key: YOUTUBE_API_KEY,
        id: videoIds,
        part: "snippet,contentDetails,statistics",
      },
    });

    const videos: YouTubeVideo[] = detailsResponse.data.items.map(
      (item: any) => ({
        videoId: item.id,
        title: item.snippet.title,
        channelName: item.snippet.channelTitle,
        thumbnailUrl:
          item.snippet.thumbnails.high?.url ||
          item.snippet.thumbnails.default.url,
        duration: parseDuration(item.contentDetails.duration),
        viewCount: parseInt(item.statistics.viewCount || "0"),
        publishedAt: item.snippet.publishedAt,
      })
    );

    return videos;
  } catch (error: any) {
    console.error("YouTube API error:", error.response?.data || error.message);
    throw new Error("Failed to fetch YouTube videos: " + error.message);
  }
}

// Parse ISO 8601 duration to readable format
function parseDuration(duration: string): string {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return "Unknown";

  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);

  return parts.join(" ") || "0s";
}

// Get video recommendations for a chapter
export async function getChapterVideos(params: {
  chapterTitle: string;
  topic: string;
  difficulty: string;
  language: string;
}): Promise<YouTubeVideo[]> {
  const searchQuery = `${params.topic} ${params.chapterTitle} ${params.difficulty} tutorial`;

  return searchYouTubeVideos({
    query: searchQuery,
    maxResults: 3,
    language: params.language,
  });
}
