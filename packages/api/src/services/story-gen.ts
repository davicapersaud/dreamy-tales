import { GoogleGenerativeAI } from '@google/generative-ai';
import { query } from '../db/client.js';
import { moderateText, getFallbackStory, GeneratedStory } from './moderation.js';
import { trackEvent } from './telemetry.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface Child {
  id: string;
  name: string;
  age: number;
  avatar: string;
  interests: string;
  name_pronunciation: string | null;
}

async function getRecentThemes(childId: string): Promise<string> {
  const rows = await query<{ title: string; theme_summary: string }>(
    'SELECT title, theme_summary FROM story_themes WHERE child_id = $1 ORDER BY created_at DESC LIMIT 5',
    [childId]
  );

  if (rows.length === 0) return 'None yet — this is their first story!';
  return rows.map((r) => `• "${r.title}": ${r.theme_summary}`).join('\n');
}

function getStoryLength(age: number): { pages: number; wordsMin: number; wordsMax: number } {
  if (age <= 4) return { pages: 3, wordsMin: 50, wordsMax: 70 };
  if (age <= 6) return { pages: 4, wordsMin: 80, wordsMax: 100 };
  if (age <= 8) return { pages: 4, wordsMin: 100, wordsMax: 130 };
  return { pages: 5, wordsMin: 120, wordsMax: 150 };
}

async function buildSystemPrompt(child: Child, interests: string[]): Promise<string> {
  const recentThemes = await getRecentThemes(child.id);
  const interestList = interests.join(', ');
  const nameNote = child.name_pronunciation
    ? ` (pronounced: ${child.name_pronunciation})`
    : '';
  const { pages, wordsMin, wordsMax } = getStoryLength(child.age);

  return `You are a master children's storyteller writing for a child aged ${child.age} years old.

STYLE RULES:
- Vocabulary appropriate for age ${child.age} (simple, vivid, joyful, wonder-filled)
- Sentences: short to medium. Avoid complex subordinate clauses.
- Tone: warm, safe, magical, and cozy. Every story ends happily.
- The protagonist is always named "${child.name}"${nameNote} and their favorite things (${interestList}) are woven into the story naturally.
- Length: ${pages} pages total, each page ${wordsMin}-${wordsMax} words.

CONTENT RULES (absolute — never break these):
- No violence, fear, darkness, or scary themes whatsoever.
- No real-world brands, celebrities, or political content.
- No romantic content of any kind.
- Always safe, age-appropriate, and delightful.
- The child always ends up happy, safe, and ready for sleep.

RECENT STORIES TO AVOID REPEATING:
${recentThemes}

OUTPUT FORMAT — you must return ONLY valid JSON, nothing else:
{
  "title": "Story Title Here",
  "themeSummary": "One sentence describing what this story is about, for future variation tracking.",
  "pages": [
    {
      "text": "Story text for this page.",
      "illustrationPrompt": "Detailed scene description for an illustration. Style: soft watercolor, warm child-friendly colors, no text in image."
    }
  ]
}`;
}

function buildUserPrompt(child: Child, interests: string[], themePrompt?: string): string {
  const interestList = interests.join(', ');
  const themeNote = themePrompt
    ? `Tonight's special theme from the parent: "${themePrompt}"`
    : `No specific theme tonight — create something magical based on their interests!`;
  const { pages } = getStoryLength(child.age);

  return `Create a ${pages}-page bedtime story for ${child.name} (age ${child.age}).
Their favorite things: ${interestList}.
${themeNote}

Remember: return ONLY the JSON object.`;
}

function parseStoryJSON(raw: string): GeneratedStory & { themeSummary: string } {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  const parsed = JSON.parse(cleaned);

  if (!parsed.title || !Array.isArray(parsed.pages) || parsed.pages.length === 0) {
    throw new Error('Invalid story structure from LLM');
  }

  return {
    title: String(parsed.title),
    themeSummary: String(parsed.themeSummary ?? 'A magical adventure'),
    pages: parsed.pages.map((p: { text: string; illustrationPrompt?: string }) => ({
      text: String(p.text),
      illustrationPrompt: String(p.illustrationPrompt ?? ''),
    })),
  };
}

export interface GenerationResult {
  story: GeneratedStory & { themeSummary: string };
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  promptModPassed: boolean;
  outputModPassed: boolean;
}

export async function generateStory(
  child: Child,
  themePrompt: string | undefined,
  parentId: string,
  appSessionId?: string
): Promise<GenerationResult> {
  const interests: string[] = JSON.parse(child.interests || '[]');
  const startTime = Date.now();

  // Pre-moderation: check the parent's theme prompt
  let promptModPassed = true;
  if (themePrompt) {
    const modResult = moderateText(themePrompt);
    promptModPassed = modResult.safe;
    if (!modResult.safe) {
      trackEvent({
        name: 'content_moderation_blocked',
        parentId,
        childId: child.id,
        appSessionId,
        properties: { stage: 'prompt', reason: modResult.reason },
      });
      throw new Error('MODERATION_BLOCKED:' + (modResult.reason ?? 'Unsafe content detected'));
    }
  }

  // Build prompts
  const systemPrompt = await buildSystemPrompt(child, interests);
  const userPrompt = buildUserPrompt(child, interests, themePrompt);

  // Call Gemini
  const geminiModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    systemInstruction: systemPrompt,
  });
  const result = await geminiModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { maxOutputTokens: 2048 },
  });

  const latencyMs = Date.now() - startTime;
  const rawText = result.response.text();
  const promptTokens = result.response.usageMetadata?.promptTokenCount ?? 0;
  const completionTokens = result.response.usageMetadata?.candidatesTokenCount ?? 0;

  // gemini-2.5-flash-lite pricing (approximate): $0.10/$0.40 per 1M tokens in/out
  const estimatedCostUsd =
    (promptTokens / 1_000_000) * 0.10 + (completionTokens / 1_000_000) * 0.40;

  // Post-moderation: check the generated story
  let outputModPassed = true;
  let story: GeneratedStory & { themeSummary: string };

  try {
    story = parseStoryJSON(rawText);
    const fullText = story.pages.map((p) => p.text).join(' ');
    const modResult = moderateText(fullText);
    outputModPassed = modResult.safe;

    if (!modResult.safe) {
      trackEvent({
        name: 'content_moderation_blocked',
        parentId,
        childId: child.id,
        appSessionId,
        properties: { stage: 'output', reason: modResult.reason },
      });
      // Fallback to safe story
      const fallback = getFallbackStory(child.name, interests);
      story = { ...fallback, themeSummary: 'A cozy magical adventure' };
      outputModPassed = false;
    }
  } catch (parseErr) {
    console.error('[story-gen] Failed to parse LLM response:', parseErr);
    const fallback = getFallbackStory(child.name, interests);
    story = { ...fallback, themeSummary: 'A cozy magical adventure' };
  }

  trackEvent({
    name: 'story_generation_completed',
    parentId,
    childId: child.id,
    appSessionId,
    properties: {
      latency_ms: latencyMs,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      estimated_cost_usd: estimatedCostUsd,
      page_count: story.pages.length,
      word_count: story.pages.reduce((sum, p) => sum + p.text.split(/\s+/).length, 0),
      output_mod_passed: outputModPassed,
    },
  });

  return {
    story,
    promptTokens,
    completionTokens,
    latencyMs,
    estimatedCostUsd,
    promptModPassed,
    outputModPassed,
  };
}
