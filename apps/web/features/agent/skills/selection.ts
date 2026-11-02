import { builtinAgentSkillsById } from "./catalog.ts";
import { isUserProvidedPublicHttpsSourceURL } from "../../research/server/url-policy.ts";
import { readTrustedExternalSourceIntent } from "./source-intent.ts";
import type {
  AgentCapability,
  BuiltinAgentSkill,
  EvidencePlan,
  SkillRequestSignals,
  SourceRole,
} from "./types.ts";

const externallyResearchableTasks = new Set(["research", "verify", "compare", "public-discussion"]);

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function sourceRolesFor(
  request: SkillRequestSignals,
  useUserMaterials: boolean,
  useExternalSources: boolean,
): SourceRole[] {
  const roles: SourceRole[] = [];

  if (useUserMaterials) roles.push("user-provided-document");
  if (!useExternalSources) return roles;

  switch (request.evidenceDomain) {
    case "academic":
      roles.push("peer-reviewed-synthesis", "original-study");
      break;
    case "policy":
      roles.push("official-policy-or-standard", "official-record");
      break;
    case "technical":
      roles.push("official-product-documentation", "official-policy-or-standard");
      break;
    case "public-discussion":
      roles.push("public-discussion");
      break;
    case "general":
      roles.push(
        "official-record",
        "government-or-institutional-data",
        "reputable-reported-analysis",
        "reference-work",
      );
      break;
  }

  if (request.involvesHighConsequenceClaims && request.evidenceDomain !== "policy") {
    roles.unshift("official-policy-or-standard");
  }

  return unique(roles);
}

export function planEvidence(
  request: SkillRequestSignals,
  availableCapabilities: ReadonlySet<AgentCapability>,
): EvidencePlan {
  const externalSourceIntent = readTrustedExternalSourceIntent(request.externalSourceIntent);
  const userMaterialsOnlyConflict =
    request.userMaterialsOnly && (
      request.explicitlyRequestsExternalVerification ||
      externalSourceIntent === "discover-additional" ||
      externalSourceIntent === "provided-only" ||
      request.userProvidedSourceUrls.length > 0
    );
  const useUserMaterials = request.usesUserMaterials || request.userMaterialsOnly;
  const externalResearchRequested =
    request.explicitlyRequestsExternalVerification ||
    externalSourceIntent === "provided-only" ||
    externalSourceIntent === "discover-additional" ||
    request.userProvidedSourceUrls.length > 0 ||
    request.asksForSources ||
    request.requiresCurrentInformation ||
    request.involvesHighConsequenceClaims ||
    request.disputedOrComparative ||
    request.requiresPreciseFactualClaims ||
    externallyResearchableTasks.has(request.task);
  const hasInvalidUserProvidedSourceUrls =
    request.userProvidedSourceUrls.length > 0 &&
    !request.userProvidedSourceUrls.every(isUserProvidedPublicHttpsSourceURL);
  const invalidUserProvidedSourceUrls = hasInvalidUserProvidedSourceUrls;
  const missingUserProvidedSourceUrls =
    externalSourceIntent === "provided-only" && request.userProvidedSourceUrls.length === 0;
  const discoveryRequested =
    externalSourceIntent === "discover-additional" ||
    (externalSourceIntent === "automatic" && (
      request.asksForSources ||
      request.explicitlyRequestsExternalVerification ||
      request.involvesHighConsequenceClaims ||
      request.disputedOrComparative ||
      ["verify", "compare", "public-discussion"].includes(request.task) ||
      request.userProvidedSourceUrls.length === 0
    ));
  const clarificationReason = userMaterialsOnlyConflict
    ? "conflicting-source-scopes"
    : externalSourceIntent === null
      ? "invalid-source-intent"
    : invalidUserProvidedSourceUrls
      ? "invalid-user-url"
      : missingUserProvidedSourceUrls
        ? "missing-user-url"
        : "none";
  const externalSourceMode =
    externalResearchRequested && clarificationReason === "none" && !request.userMaterialsOnly
      ? discoveryRequested
        ? "discovery"
        : "known-url"
      : "none";
  const useExternalSources = externalSourceMode !== "none";
  const requiredCapabilities: AgentCapability[] = [];

  if (useUserMaterials) requiredCapabilities.push("documents.user.read");
  if (externalSourceMode !== "none") requiredCapabilities.push("research.web.read");
  if (externalSourceMode === "discovery") requiredCapabilities.push("research.web.discover");

  const missingCapabilities = requiredCapabilities.filter(
    (capability) => !availableCapabilities.has(capability),
  );
  const reasons: string[] = [];

  if (request.asksForSources) reasons.push("The user explicitly asked for sources.");
  if (request.requiresCurrentInformation) reasons.push("The requested information can change over time.");
  if (request.involvesHighConsequenceClaims) {
    reasons.push("Consequential claims require current, attributable evidence and appropriate human review.");
  }
  if (request.disputedOrComparative) reasons.push("The request requires evidence comparison or conflict handling.");
  if (request.requiresPreciseFactualClaims) reasons.push("The requested factual precision needs direct evidence.");
  if (externallyResearchableTasks.has(request.task)) reasons.push(`The ${request.task} task requires retrieval when external scope permits it.`);
  if (useUserMaterials) reasons.push("The task depends on user-provided material and owner-scoped retrieval.");
  if (request.userMaterialsOnly) reasons.push("The user's source boundary prohibits external lookup.");
  if (externalSourceMode === "known-url") {
    reasons.push("Only validated user-provided URLs may be read; this mode does not discover sources.");
  }
  if (externalSourceMode === "discovery") {
    reasons.push("Finding sources requires a separate discovery capability in addition to reading the resulting URLs.");
  }
  if (invalidUserProvidedSourceUrls) {
    reasons.push("One or more user-provided source URLs were not validated by the server's HTTPS URL policy.");
  }
  if (missingUserProvidedSourceUrls) {
    reasons.push("The user requested work limited to supplied URLs but did not provide a valid URL.");
  }
  if (externalSourceIntent === null) {
    reasons.push("The source scope was not issued by the server from explicit user intent.");
  }
  if (userMaterialsOnlyConflict) {
    reasons.push("The request both limits evidence to supplied material and asks for outside verification; clarify before any external retrieval.");
  }
  if (missingCapabilities.length > 0) {
    reasons.push("A required retrieval capability is unavailable; no source lookup may be claimed.");
  }

  const retrieval = clarificationReason !== "none"
    ? "clarify"
    : requiredCapabilities.length > 0
      ? "required"
      : "not-needed";

  const approvedUserSourceUrls = Object.freeze(
    externalSourceMode === "known-url"
      ? request.userProvidedSourceUrls.map((url) => url.href)
      : [],
  );

  return {
    retrieval,
    externalSourceMode,
    clarificationReason,
    approvedUserSourceUrls,
    useUserMaterials,
    useExternalSources,
    freshness:
      request.requiresCurrentInformation ||
      request.involvesHighConsequenceClaims ||
      request.evidenceDomain === "policy"
        ? "current"
        : "none",
    preferredSourceRoles: sourceRolesFor(request, useUserMaterials, useExternalSources),
    reasons,
    requiredCapabilities: unique(requiredCapabilities),
    missingCapabilities: unique(missingCapabilities),
  };
}

export function selectBuiltinSkills(
  request: SkillRequestSignals,
  evidence: EvidencePlan,
): readonly BuiltinAgentSkill[] {
  const selected = new Set<string>(["research.evidence-need-triage"]);
  const usesEvidence = evidence.useUserMaterials || evidence.useExternalSources;

  if (usesEvidence) {
    selected.add("research.uncertainty-and-evidence-limits");
    selected.add("safety.retrieved-content-isolation");
  }

  if (evidence.useUserMaterials) {
    selected.add("research.user-document-grounding");
    selected.add("research.document-extraction-provenance");
    selected.add("research.claim-citation-audit");
    selected.add("research.quote-and-locator-check");
  }

  if (evidence.useExternalSources) {
    selected.add("research.question-scoping");
    selected.add("research.source-strategy");
    selected.add("research.source-quality-assessment");
    selected.add("research.safe-web-retrieval");
    selected.add("research.claim-citation-audit");
    selected.add("research.official-primary-sources");
  }

  if (evidence.externalSourceMode === "discovery") {
    selected.add("research.source-discovery");
  }

  if (evidence.freshness === "current" && evidence.useExternalSources) {
    selected.add("research.freshness-and-versioning");
  }

  if (request.evidenceDomain === "academic" && evidence.useExternalSources) {
    selected.add("research.scholarly-evidence");
    selected.add("research.methodology-review");
    selected.add("research.independent-corroboration");
  }

  if (request.evidenceDomain === "policy" && evidence.useExternalSources) {
    selected.add("research.policy-and-jurisdiction");
    selected.add("research.freshness-and-versioning");
  }

  if (request.evidenceDomain === "technical" && evidence.useExternalSources) {
    selected.add("research.technical-documentation");
    selected.add("research.freshness-and-versioning");
  }

  if (request.evidenceDomain === "public-discussion" || request.task === "public-discussion") {
    if (evidence.useExternalSources) selected.add("research.public-discourse-analysis");
  }

  if (request.disputedOrComparative) {
    selected.add("research.conflict-synthesis");
    if (evidence.useExternalSources) selected.add("research.independent-corroboration");
  }

  if (request.involvesHighConsequenceClaims && evidence.useExternalSources) {
    selected.add("research.policy-and-jurisdiction");
    selected.add("research.freshness-and-versioning");
    selected.add("research.independent-corroboration");
  }

  if (["explain", "study"].includes(request.task) && evidence.useUserMaterials) {
    selected.add("study.source-grounded-tutoring");
  }
  if (request.task === "quiz") selected.add("study.quiz-from-material");
  if (request.task === "flashcards") selected.add("study.flashcards-from-material");
  if (request.task === "schedule") {
    selected.add("calendar.deadline-to-study-plan");
    selected.add("calendar.conflict-review");
    selected.add("calendar.time-zone-and-recurrence");
  }

  return [...selected].map((id) => {
    const skill = builtinAgentSkillsById.get(id);
    if (!skill) throw new Error(`Unknown built-in skill: ${id}`);
    return skill;
  });
}

export interface ActivatedSkills {
  readonly available: readonly BuiltinAgentSkill[];
  readonly blocked: readonly {
    readonly skill: BuiltinAgentSkill;
    readonly missingCapabilities: readonly AgentCapability[];
  }[];
}

export function activateSkills(
  skills: readonly BuiltinAgentSkill[],
  availableCapabilities: ReadonlySet<AgentCapability>,
): ActivatedSkills {
  const available: BuiltinAgentSkill[] = [];
  const blocked: {
    skill: BuiltinAgentSkill;
    missingCapabilities: AgentCapability[];
  }[] = [];

  for (const skill of skills) {
    const missingCapabilities = skill.requiredCapabilities.filter(
      (capability) => !availableCapabilities.has(capability),
    );

    if (missingCapabilities.length > 0) {
      blocked.push({ skill, missingCapabilities });
    } else {
      available.push(skill);
    }
  }

  return { available, blocked };
}
