// AI Prompt Templates for Proposal Generation
// Playbook-based approach for different job scenarios

export type PlaybookType = "AUDIT_PITCH" | "CONTEXT_TRAP" | "DIRECT_APPLY";

export interface PersonaContext {
  name: string;
  bio: string;
  tone: string;
  defaultSignOff: string;
  hourlyRate: number;
  expertise: string[];
}

export interface JobContext {
  title: string;
  description: string;
  budget?: string;
  clientName?: string;
  clientLocation?: string;
  clientCountry?: string;
  clientTotalSpent?: number;
  clientHireRate?: number;
  hasExternalLinks: boolean;
  externalLinks?: string[];
  skillsRequired?: string[];
  jobType?: string;
  experienceLevel?: string;
}

export interface AssetContext {
  title: string;
  url: string;
  description?: string;
  category: string;
}

export interface PromptContext {
  persona: PersonaContext;
  job: JobContext;
  playbook: PlaybookType;
  assets: AssetContext[];
  maxLength?: number;
}

// System prompt that sets the overall behavior
export const SYSTEM_PROMPT = `You are an expert Upwork proposal writer with a 40%+ win rate. You write proposals that:
- Are personalized and reference specific details from the job posting
- Lead with value and outcomes, not credentials
- Are concise (under 150 words unless specified)
- Include a clear call-to-action
- Never use generic phrases like "I am excited to apply" or "I am confident I can help"
- Sound human and conversational, not robotic

You follow the specified playbook strategy and match the persona's tone exactly.`;

// Audit Pitch: For jobs with external links - offer free audit
export const AUDIT_PITCH_PROMPT = `Write a proposal using the AUDIT PITCH playbook.

STRATEGY: The client has external links in their posting. Offer to record a FREE Loom video audit of their current solution to demonstrate value before they hire.

PERSONA:
Name: {{persona.name}}
Bio: {{persona.bio}}
Expertise: {{persona.expertise}}
Tone: {{persona.tone}}

JOB DETAILS:
Title: {{job.title}}
Description: {{job.description}}
Budget: {{job.budget}}
Client: {{job.clientName}} from {{job.clientLocation}}
Client Stats: {{job.clientTotalSpent}} USD spent, {{job.clientHireRate}}% hire rate
External Links Found: {{job.externalLinks}}

PORTFOLIO PIECE TO REFERENCE: {{assets[0].title}} - {{assets[0].url}}

STRUCTURE:
1. Greet by name if known (otherwise skip greeting)
2. Reference their specific project and one detail that shows you read carefully
3. Offer to record a FREE 5-minute Loom audit of [their current solution/website/system]
4. Mention ONE relevant portfolio piece
5. End with "{{persona.defaultSignOff}}"

CONSTRAINTS:
- Maximum 150 words
- Be {{persona.tone}}
- No generic phrases
- Make the free audit the main hook`;

// Context Trap: For vague jobs - ask clarifying questions
export const CONTEXT_TRAP_PROMPT = `Write a proposal using the CONTEXT TRAP playbook.

STRATEGY: The job description is vague or lacks detail. Ask 2-3 smart clarifying questions that demonstrate expertise and get the client to invest in responding.

PERSONA:
Name: {{persona.name}}
Bio: {{persona.bio}}
Expertise: {{persona.expertise}}
Tone: {{persona.tone}}

JOB DETAILS:
Title: {{job.title}}
Description: {{job.description}}
Budget: {{job.budget}}
Client: {{job.clientName}} from {{job.clientLocation}}
Client Stats: {{job.clientTotalSpent}} USD spent, {{job.clientHireRate}}% hire rate

PORTFOLIO PIECE TO REFERENCE: {{assets[0].title}} - {{assets[0].url}}

STRUCTURE:
1. Show you understand their high-level goal
2. Acknowledge the type of project (don't pretend you know specifics)
3. Ask 2-3 SMART questions that:
   - Demonstrate your expertise in this area
   - Help you give an accurate quote
   - Show you're thinking about their success
4. Briefly mention relevant experience
5. End with "{{persona.defaultSignOff}}"

CONSTRAINTS:
- Maximum 150 words
- Questions should be insightful, not basic
- Be {{persona.tone}}
- Position questions as helping THEM, not you`;

// Direct Apply: For clear jobs - straightforward pitch
export const DIRECT_APPLY_PROMPT = `Write a proposal using the DIRECT APPLY playbook.

STRATEGY: The job has clear requirements. Pitch directly and show you can deliver exactly what they need.

PERSONA:
Name: {{persona.name}}
Bio: {{persona.bio}}
Expertise: {{persona.expertise}}
Tone: {{persona.tone}}

JOB DETAILS:
Title: {{job.title}}
Description: {{job.description}}
Budget: {{job.budget}}
Client: {{job.clientName}} from {{job.clientLocation}}
Client Stats: {{job.clientTotalSpent}} USD spent, {{job.clientHireRate}}% hire rate
Skills Required: {{job.skillsRequired}}

PORTFOLIO PIECE TO REFERENCE: {{assets[0].title}} - {{assets[0].url}}

STRUCTURE:
1. Lead with the outcome you'll deliver (not "I can help with...")
2. Reference ONE specific detail from their posting
3. Briefly explain your approach (1-2 sentences)
4. Mention ONE highly relevant portfolio piece
5. End with "{{persona.defaultSignOff}}"

CONSTRAINTS:
- Maximum 120 words
- Be {{persona.tone}}
- No filler words
- Lead with value, not credentials`;

// P.S. Line Generator
export const PS_LINE_PROMPT = `Generate a compelling P.S. line for this proposal.

JOB: {{job.title}}
CLIENT: {{job.clientName}} from {{job.clientLocation}}
PLAYBOOK: {{playbook}}

The P.S. should:
- Add urgency or a bonus value proposition
- Be 1-2 sentences max
- Feel natural, not salesy

Examples:
- "P.S. - I noticed your current site loads in 8 seconds. Happy to include a quick performance fix in the initial scope."
- "P.S. - I'm available to start this week and can have a working prototype in 48 hours."
- "P.S. - Just shipped a similar feature last week - the pattern is fresh in my mind."`;

// Helper to select the right prompt template
export function getPlaybookPrompt(playbook: PlaybookType): string {
  switch (playbook) {
    case "AUDIT_PITCH":
      return AUDIT_PITCH_PROMPT;
    case "CONTEXT_TRAP":
      return CONTEXT_TRAP_PROMPT;
    case "DIRECT_APPLY":
      return DIRECT_APPLY_PROMPT;
    default:
      return DIRECT_APPLY_PROMPT;
  }
}

// Helper to fill template variables
export function fillPromptTemplate(template: string, context: PromptContext): string {
  let filled = template;

  // Replace persona variables
  filled = filled.replace(/\{\{persona\.name\}\}/g, context.persona.name);
  filled = filled.replace(/\{\{persona\.bio\}\}/g, context.persona.bio);
  filled = filled.replace(/\{\{persona\.tone\}\}/g, context.persona.tone);
  filled = filled.replace(/\{\{persona\.defaultSignOff\}\}/g, context.persona.defaultSignOff);
  filled = filled.replace(/\{\{persona\.expertise\}\}/g, context.persona.expertise.join(", "));

  // Replace job variables
  filled = filled.replace(/\{\{job\.title\}\}/g, context.job.title);
  filled = filled.replace(/\{\{job\.description\}\}/g, context.job.description);
  filled = filled.replace(/\{\{job\.budget\}\}/g, context.job.budget || "Not specified");
  filled = filled.replace(/\{\{job\.clientName\}\}/g, context.job.clientName || "the client");
  filled = filled.replace(/\{\{job\.clientLocation\}\}/g, context.job.clientLocation || "Unknown");
  filled = filled.replace(/\{\{job\.clientTotalSpent\}\}/g, String(context.job.clientTotalSpent || 0));
  filled = filled.replace(/\{\{job\.clientHireRate\}\}/g, String(context.job.clientHireRate || 0));
  filled = filled.replace(/\{\{job\.externalLinks\}\}/g, context.job.externalLinks?.join(", ") || "None found");
  filled = filled.replace(/\{\{job\.skillsRequired\}\}/g, context.job.skillsRequired?.join(", ") || "Not specified");

  // Replace playbook
  filled = filled.replace(/\{\{playbook\}\}/g, context.playbook);

  // Replace asset variables (use first asset if available)
  if (context.assets.length > 0) {
    filled = filled.replace(/\{\{assets\[0\]\.title\}\}/g, context.assets[0].title);
    filled = filled.replace(/\{\{assets\[0\]\.url\}\}/g, context.assets[0].url);
  } else {
    filled = filled.replace(/\{\{assets\[0\]\.title\}\}/g, "[Your Portfolio Piece]");
    filled = filled.replace(/\{\{assets\[0\]\.url\}\}/g, "[Portfolio URL]");
  }

  return filled;
}

// Recommend playbook based on job characteristics
export function recommendPlaybook(job: JobContext): {
  type: PlaybookType;
  reason: string;
  confidence: number;
} {
  // AUDIT_PITCH: Client has external links
  if (job.hasExternalLinks && job.externalLinks && job.externalLinks.length > 0) {
    return {
      type: "AUDIT_PITCH",
      reason: "External links detected - offer free audit to demonstrate value",
      confidence: 0.9,
    };
  }

  // CONTEXT_TRAP: Vague description
  const descriptionLength = job.description?.length || 0;
  const hasVagueIndicators =
    descriptionLength < 200 ||
    /need help|looking for|someone to/i.test(job.description || "") ||
    !/specific|exactly|must have|required/i.test(job.description || "");

  if (hasVagueIndicators) {
    return {
      type: "CONTEXT_TRAP",
      reason: "Limited context - ask clarifying questions to stand out",
      confidence: 0.8,
    };
  }

  // DIRECT_APPLY: Clear requirements
  return {
    type: "DIRECT_APPLY",
    reason: "Clear requirements - pitch directly with relevant experience",
    confidence: 0.7,
  };
}
