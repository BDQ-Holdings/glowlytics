export type ContentType = "blog" | "faq" | "guide" | "glossary";
export type SearchIntent = "informational" | "transactional" | "navigational";
export type ClusterStatus = "new" | "researched" | "written";
export type Confidence = "high" | "medium" | "low";
export type RunStatus = "completed" | "partial" | "failed" | "skipped";

export interface KeywordCluster {
  slug: string;
  primaryKeyword: string;
  relatedKeywords: string[];
  contentType: ContentType;
  intent: SearchIntent;
  opportunityScore: number;
  paaQuestions: string[];
  status: ClusterStatus;
}

export interface SerpResult {
  title: string;
  url: string;
  description: string;
  headings: string[];
}

export interface SynthesizedFact {
  fact: string;
  sources: string[];
  confidence: Confidence;
}

export interface ResearchDossier {
  slug: string;
  primaryKeyword: string;
  serpSnapshot: SerpResult[];
  contentGaps: string[];
  synthesizedFacts: SynthesizedFact[];
  medicalReferences: { title: string; url: string }[];
  competitorContentStructure: string[];
  recommendedAngle: string;
  recommendedWordCount: number;
  recommendedHeadings: string[];
}

export interface ContentFrontmatter {
  title: string;
  slug: string;
  description: string;
  type: ContentType;
  status: "draft" | "approved" | "rejected";
  keywords: string[];
  dateGenerated: string;
  dateModified?: string;
  sources: { title: string; url: string }[];
  readingTime: number;
  schema: "Article" | "FAQPage" | "HowTo";
  relatedSlugs: string[];
}

export interface StageResult {
  name: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timeoutMs: number;
  timedOut?: boolean;
  signal?: string;
  error?: string;
}

export interface DailyRunReport {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  localDate: string;
  dailyLimit: number;
  alreadyWrittenToday: number;
  selectedSlugs: string[];
  researchedSlugs: string[];
  writtenSlugs: string[];
  failedSlugs: string[];
  skippedReason?: string;
  stages: StageResult[];
  discoverTriggered: boolean;
  status: RunStatus;
}
