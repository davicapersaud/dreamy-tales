import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/client.js';
import { moderateText, getFallbackStory, GeneratedStory } from './moderation.js';
import { trackEvent } from './telemetry.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface Child {
  id: string;
  name: string;
  age: number;
  avatar: string;
  interests: string;
  name_pronunciation: string | null;
}

function getRecentThemes(childId: string): string {
  const rows = db.prepare(
    'SELECT title, theme_summary FROM story_themes WHERE child_id = ? ORDER BY created_at DESC LIMIT 5'
  ).all(childId) as { title: string; theme_summary: string }[];

  if (rows.length === 0) return 'None yet — this is their first story!';
  return rows.map((r) => `• "${r.title}": ${r.theme_summary}`).join('\n');
}

function buildSystemPrompt(child: Child, interests: string[]): string {
  const recentThemes = getRecentThemes(child.id);
  const interestList = interests.join(', ');
  const nameNote = child.name_pronunciation
    ? ` (pronounced: ${child.name_pronunciation})`
    : '';

  return `You are a master children's storyteller writing for a child aged ${child.age} years old.

STYLE RULES:
- Vocabulary appropriate for age ${child.age} (simple, vivid, joyful, wonder-filled)
- Sentences: short to medium. Avoid complex subordinate clauses.
- Tone: warm, safe, magical, and cozy. Every story ends happily.
- The protagonist is always named "${child.name}"${nameNote} and their favorite things (${interestList}) are woven into the story naturally.
- Length: 4 pages total, each page 80-120 words.

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

  return `Create a 4-page bedtime story for ${child.name} (age ${child.age}).
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
  const systemPrompt = buildSystemPrompt(child, interests);
  const userPrompt = buildUserPrompt(child, interests, themePrompt);

  // Call Claude
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const latencyMs = Date.now() - startTime;
  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
  const promptTokens = response.usage.input_tokens;
  const completionTokens = response.usage.output_tokens;

  // Claude claude-sonnet-4-6 pricing (approximate): $3/$15 per 1M tokens in/out
  const estimatedCostUsd =
    (promptTokens / 1_000_000) * 3 + (completionTokens / 1_000_000) * 15;

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
