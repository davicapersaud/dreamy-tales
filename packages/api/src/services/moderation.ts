// Content moderation — keyword-based safety layer.
// A lightweight local implementation that checks for obviously inappropriate content.
// Works without any external API key.

const BLOCKED_PATTERNS = [
  /\b(murder|gore|suicide|shoot|stab)\b/i,
  /\b(sex|sexual|nude|naked|porn|adult|explicit)\b/i,
  /\b(drugs|alcohol|beer|wine|drunk|high|weed|cocaine)\b/i,
  /\b(racist|slur|fuck|shit|bastard)\b/i,
];

export interface ModerationResult {
  safe: boolean;
  reason?: string;
}

export function moderateText(text: string): ModerationResult {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, reason: `Content matched safety filter: ${pattern.source}` };
    }
  }
  return { safe: true };
}

// Returns a generic safe fallback story if output moderation fails
export function getFallbackStory(childName: string, interests: string[]): GeneratedStory {
  const interest = interests[0] ?? 'stars';
  return {
    title: `${childName} and the Magical ${interest.charAt(0).toUpperCase() + interest.slice(1)}`,
    pages: [
      {
        text: `Once upon a time, a wonderful child named ${childName} discovered something magical hidden just around the corner of their cozy bedroom.`,
        illustrationPrompt: `A cozy bedroom at night, soft moonlight through the window, a child discovering a glowing magical object. Watercolor style, warm colors.`,
      },
      {
        text: `With curiosity sparkling in their eyes, ${childName} reached out and touched the magical surprise. It glowed with all the colors of the rainbow!`,
        illustrationPrompt: `A child's hands reaching toward a glowing rainbow object, magical sparkles all around. Soft watercolor style, warm and cozy.`,
      },
      {
        text: `The magic took ${childName} on the most wonderful adventure — floating through clouds and dancing with friendly stars until the moon winked goodnight.`,
        illustrationPrompt: `A child floating through fluffy clouds, friendly smiling stars dancing around, full moon glowing softly. Watercolor style, dreamy and magical.`,
      },
      {
        text: `When the adventure was done, ${childName} felt warm and happy, snuggled back into the coziest bed in the whole wide world. And they fell fast asleep with a smile.`,
        illustrationPrompt: `A child sleeping peacefully in a cozy bed, soft night light, stuffed animals, stars visible through window. Warm watercolor style.`,
      },
    ],
  };
}

export interface StoryPage {
  text: string;
  illustrationPrompt: string;
}

export interface GeneratedStory {
  title: string;
  pages: StoryPage[];
}
