// AI Proposal Generator
// Integrates with Claude/OpenAI for intelligent proposal generation

import Anthropic from "@anthropic-ai/sdk";
import {
  type PlaybookType,
  type PersonaContext,
  type JobContext,
  type AssetContext,
  type PromptContext,
  SYSTEM_PROMPT,
  getPlaybookPrompt,
  fillPromptTemplate,
  PS_LINE_PROMPT,
  recommendPlaybook,
} from "./prompts";

export type AIModel = "claude-3-5-sonnet-latest" | "claude-3-haiku-20240307";

export interface GeneratorConfig {
  model?: AIModel;
  persona: PersonaContext;
  job: JobContext;
  playbook?: PlaybookType;
  assets: AssetContext[];
  maxLength?: number;
  includePS?: boolean;
}

export interface GeneratedProposal {
  content: string;
  psLine?: string;
  playbook: PlaybookType;
  playbookReason: string;
  tokensUsed: number;
  model: string;
}

// Default persona if none provided
const DEFAULT_PERSONA: PersonaContext = {
  name: "Shariq",
  bio: "GenAI specialist and full-stack developer helping businesses automate workflows with AI",
  tone: "confident, friendly, and direct",
  defaultSignOff: "Looking forward to chatting!",
  hourlyRate: 75,
  expertise: ["AI/ML", "Web Scraping", "Automation", "Full-Stack Development"],
};

// Initialize Anthropic client (lazy)
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// Generate proposal using Claude
async function generateWithClaude(
  systemPrompt: string,
  userPrompt: string,
  model: AIModel = "claude-3-5-sonnet-latest"
): Promise<{ content: string; tokensUsed: number }> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  const content = textContent?.type === "text" ? textContent.text : "";
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  return { content, tokensUsed };
}

// Main proposal generation function
export async function generateProposal(
  config: GeneratorConfig
): Promise<GeneratedProposal> {
  const {
    model = "claude-3-5-sonnet-latest",
    persona = DEFAULT_PERSONA,
    job,
    playbook: requestedPlaybook,
    assets,
    maxLength = 150,
    includePS = true,
  } = config;

  // Auto-recommend playbook if not specified
  const recommendation = recommendPlaybook(job);
  const playbook = requestedPlaybook || recommendation.type;

  // Build the prompt context
  const context: PromptContext = {
    persona,
    job,
    playbook,
    assets,
    maxLength,
  };

  // Get the playbook-specific prompt template
  const promptTemplate = getPlaybookPrompt(playbook);
  const filledPrompt = fillPromptTemplate(promptTemplate, context);

  // Generate the main proposal
  const { content: proposalContent, tokensUsed: mainTokens } =
    await generateWithClaude(SYSTEM_PROMPT, filledPrompt, model);

  let psLine: string | undefined;
  let totalTokens = mainTokens;

  // Generate P.S. line if requested
  if (includePS) {
    const psPrompt = fillPromptTemplate(PS_LINE_PROMPT, context);
    const { content: psContent, tokensUsed: psTokens } = await generateWithClaude(
      "You generate compelling P.S. lines for Upwork proposals. Be concise and add value.",
      psPrompt,
      "claude-3-haiku-20240307" // Use faster model for P.S.
    );
    psLine = psContent.trim();
    totalTokens += psTokens;
  }

  return {
    content: proposalContent.trim(),
    psLine,
    playbook,
    playbookReason: recommendation.reason,
    tokensUsed: totalTokens,
    model,
  };
}

// Improve an existing proposal
export async function improveProposal(
  currentProposal: string,
  feedback: string,
  model: AIModel = "claude-3-5-sonnet-latest"
): Promise<{ content: string; tokensUsed: number }> {
  const prompt = `Improve this Upwork proposal based on the feedback provided.

CURRENT PROPOSAL:
${currentProposal}

FEEDBACK:
${feedback}

INSTRUCTIONS:
- Keep the same overall structure and length
- Address the specific feedback
- Maintain a natural, conversational tone
- Don't add generic filler

Return only the improved proposal, no explanations.`;

  return generateWithClaude(SYSTEM_PROMPT, prompt, model);
}

// Generate variations of a proposal
export async function generateVariations(
  config: GeneratorConfig,
  count: number = 3
): Promise<GeneratedProposal[]> {
  const variations: GeneratedProposal[] = [];

  // Generate each variation with slightly different prompts
  const toneVariations = ["confident and direct", "friendly and warm", "professional and measured"];

  for (let i = 0; i < Math.min(count, toneVariations.length); i++) {
    const modifiedPersona = {
      ...config.persona,
      tone: toneVariations[i],
    };

    const proposal = await generateProposal({
      ...config,
      persona: modifiedPersona,
      includePS: i === 0, // Only include P.S. in first variation
    });

    variations.push(proposal);
  }

  return variations;
}

// Research client (placeholder for future enhancement)
export async function researchClient(
  clientName: string,
  _jobUrl: string
): Promise<{
  insights: string[];
  suggestedApproach: string;
  personalizedOpener: string;
}> {
  // In a full implementation, this would:
  // 1. Search for client's past jobs on Upwork
  // 2. Analyze their hiring patterns
  // 3. Look for social media presence
  // For now, return basic insights based on name

  const insights = [
    `Client name: ${clientName}`,
    "Consider personalizing the greeting",
    "Reference their specific industry if known",
  ];

  return {
    insights,
    suggestedApproach: "Personalize your opener with their name",
    personalizedOpener: clientName
      ? `Hi ${clientName.split(" ")[0]},`
      : "Hi there,",
  };
}

// Estimate proposal quality (basic heuristics)
export function estimateProposalQuality(proposal: string): {
  score: number;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 80; // Start with good score

  // Check length
  const wordCount = proposal.split(/\s+/).length;
  if (wordCount > 200) {
    issues.push("Proposal is too long (over 200 words)");
    score -= 10;
  } else if (wordCount < 50) {
    issues.push("Proposal might be too short");
    score -= 5;
  }

  // Check for generic phrases
  const genericPhrases = [
    "I am excited",
    "I am confident",
    "I would love to",
    "I have extensive experience",
    "I am the perfect fit",
    "Please hire me",
  ];

  genericPhrases.forEach((phrase) => {
    if (proposal.toLowerCase().includes(phrase.toLowerCase())) {
      issues.push(`Contains generic phrase: "${phrase}"`);
      score -= 5;
    }
  });

  // Check for personalization
  if (!proposal.includes("your") && !proposal.includes("you")) {
    suggestions.push("Add more focus on the client's needs (use 'you/your')");
    score -= 5;
  }

  // Check for question (engagement)
  if (!proposal.includes("?")) {
    suggestions.push("Consider adding a question to encourage dialogue");
    score -= 3;
  }

  // Check for portfolio/link reference
  if (!proposal.includes("http") && !proposal.includes("portfolio")) {
    suggestions.push("Consider referencing a relevant portfolio piece");
    score -= 3;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    suggestions,
  };
}
