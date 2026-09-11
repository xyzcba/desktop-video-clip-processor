/**
 * Dynamic LLM prompt generator for viral clip analysis
 */

export function generateLlmPrompt(recommendedDurationSec: number, transcriptText?: string): string {
  const basePrompt = `You are an elite short-form video editor and viral content strategist.
Analyze the following timestamped video transcript to identify high-potential viral moments suitable for vertical video platforms (YouTube Shorts, TikTok, Instagram Reels).

CRITICAL CONSTRAINTS:
1. RECOMMENDED CLIP DURATION: Target approximately 15 to ${recommendedDurationSec} seconds per clip. While ${recommendedDurationSec} seconds is the recommended target duration, you MAY exceed it when necessary to preserve a self-contained narrative arc, punchline, or complete thought without awkward mid-sentence cutoffs.
2. TIMESTAMPS: Use the EXACT global timeline timestamps from the original video provided in the transcript (format HH:MM:SS or MM:SS).
3. HOOK PRIORITY: The start of each clip MUST have a strong hook in the first 3 seconds (curiosity, controversy, surprising statement, bold claim, or intriguing question).
4. SELF-CONTAINED: Ensure each clip makes complete narrative sense on its own without missing context.
5. QUALITY OVER QUANTITY: Only select moments that are genuinely engaging, educational, funny, surprising, or emotional. Do NOT generate filler or weak clips just to reach an arbitrary count.

REQUIRED OUTPUT FORMAT:
You must respond with ONLY a valid, raw JSON object matching this exact schema.
DO NOT wrap the output in markdown code blocks (\`\`\`json).
DO NOT include any greeting, preamble, commentary, or text before or after the JSON.

Expected JSON Schema:
{
  "clips": [
    {
      "id": 1,
      "title": "Clear punchy title under 60 chars",
      "description": "Brief explanation of why this moment is engaging and its core message",
      "start": "00:01:25",
      "end": "00:02:15",
      "hashtags": [
        "#Shorts",
        "#RelevantTopic"
      ],
      "keywords": [
        "key phrase 1",
        "key phrase 2"
      ]
    }
  ]
}

TRANSCRIPT TO ANALYZE:
`;

  if (transcriptText && transcriptText.trim()) {
    return `${basePrompt}\n${transcriptText.trim()}\n`;
  }

  return basePrompt;
}
