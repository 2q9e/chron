import assert from "node:assert/strict";
import test from "node:test";
import { builtinAgentSkills, builtinAgentSkillsById } from "./catalog.ts";
import { reviewSourceQuality, validateClaimCitations } from "./evidence.ts";
import { prepareAgentTurn } from "./prepare-turn.ts";
import { activateSkills, planEvidence, selectBuiltinSkills } from "./selection.ts";
import { resolveUserExternalSourceIntent } from "./source-intent.ts";
import { parseUserProvidedPublicHttpsSourceURL } from "../../research/server/url-policy.ts";

const userOnlyRequest = {
  task: "summarize",
  evidenceDomain: "academic",
  externalSourceIntent: resolveUserExternalSourceIntent("automatic"),
  userProvidedSourceUrls: [],
  asksForSources: false,
  requiresCurrentInformation: false,
  usesUserMaterials: true,
  userMaterialsOnly: true,
  explicitlyRequestsExternalVerification: false,
  involvesHighConsequenceClaims: false,
  disputedOrComparative: false,
  requiresPreciseFactualClaims: false,
};

function makeSource(overrides = {}) {
  return {
    sourceId: "source-a",
    sourceVersion: "2026-10-30:revision-1",
    sourceRole: "official-record",
    provenance: "verified",
    publicationStatus: "published",
    directlySupportsClaimIds: ["claim-a"],
    methodIsTransparent: "not-applicable",
    sponsoredOrMateriallyInterested: false,
    retrievedAt: "2026-10-30T12:00:00.000Z",
    independenceGroup: "origin-a",
    ...overrides,
  };
}

function makeWebCitation(overrides = {}) {
  const excerpt = "Direct support";
  return {
    citationId: "citation-a",
    sourceId: "source-a",
    ownerId: "user-a",
    sourceRole: "official-record",
    sourceVersion: "2026-10-30:revision-1",
    excerptStart: 0,
    excerptEnd: excerpt.length,
    excerpt,
    url: "https://records.example.org/item",
    sourceDeleted: false,
    sourceChangedSinceRetrieval: false,
    ...overrides,
  };
}

test("source-only document work does not trigger outside retrieval", () => {
  const plan = planEvidence(userOnlyRequest, new Set(["documents.user.read"]));
  const skills = selectBuiltinSkills(userOnlyRequest, plan);
  const activation = activateSkills(skills, new Set(["documents.user.read"]));

  assert.equal(plan.useUserMaterials, true);
  assert.equal(plan.useExternalSources, false);
  assert.equal(plan.retrieval, "required");
  assert.ok(skills.some((skill) => skill.id === "research.user-document-grounding"));
  assert.ok(skills.some((skill) => skill.id === "safety.retrieved-content-isolation"));
  assert.ok(!skills.some((skill) => skill.id === "research.safe-web-retrieval"));
  assert.ok(activation.blocked.some((item) => item.skill.id === "research.user-document-grounding"));
});

test("conflicting document-only scope and outside verification requires clarification", () => {
  const plan = planEvidence(
    {
      ...userOnlyRequest,
      task: "verify",
      explicitlyRequestsExternalVerification: true,
    },
    new Set(["documents.user.read", "research.web.read"]),
  );

  assert.equal(plan.retrieval, "clarify");
  assert.equal(plan.useExternalSources, false);
  assert.ok(plan.reasons.some((reason) => reason.includes("clarify")));
});

test("academic research routes to current, claim-aware evidence skills", () => {
  const request = {
    ...userOnlyRequest,
    task: "research",
    usesUserMaterials: false,
    userMaterialsOnly: false,
    asksForSources: true,
    requiresCurrentInformation: true,
    requiresPreciseFactualClaims: true,
    disputedOrComparative: true,
  };
  const plan = planEvidence(request, new Set(["research.web.read", "research.web.discover"]));
  const skills = selectBuiltinSkills(request, plan);
  const ids = new Set(skills.map((skill) => skill.id));

  assert.equal(plan.retrieval, "required");
  assert.deepEqual(plan.preferredSourceRoles, ["peer-reviewed-synthesis", "original-study"]);
  assert.ok(ids.has("research.scholarly-evidence"));
  assert.ok(ids.has("research.methodology-review"));
  assert.ok(ids.has("research.source-quality-assessment"));
  assert.ok(ids.has("research.independent-corroboration"));
  assert.ok(ids.has("research.conflict-synthesis"));
  assert.ok(ids.has("research.claim-citation-audit"));
  assert.ok(ids.has("research.safe-web-retrieval"));
});

test("missing web access remains visible and cannot be represented as research", () => {
  const request = { ...userOnlyRequest, task: "research", userMaterialsOnly: false, usesUserMaterials: false };
  const plan = planEvidence(request, new Set());
  const skills = selectBuiltinSkills(request, plan);
  const activation = activateSkills(skills, new Set());

  assert.deepEqual(plan.missingCapabilities, ["research.web.read", "research.web.discover"]);
  assert.ok(activation.blocked.some((item) => item.skill.id === "research.safe-web-retrieval"));
  assert.ok(plan.reasons.some((reason) => reason.includes("no source lookup may be claimed")));
});

test("prepared web research instructions require HTTPS-only source retrieval", () => {
  const prepared = prepareAgentTurn(
    {
      ...userOnlyRequest,
      task: "research",
      usesUserMaterials: false,
      userMaterialsOnly: false,
      userProvidedSourceUrls: [parseUserProvidedPublicHttpsSourceURL("https://research.example.org/source")],
    },
    new Set(["research.web.read", "inference.meta.authorized"]),
  );

  assert.equal(prepared.status, "ready");
  assert.equal(prepared.evidencePlan.externalSourceMode, "known-url");
  assert.ok(!prepared.selectedSkillIds.includes("research.source-discovery"));
  assert.ok(prepared.instructions.includes("Known-URL reading does not perform source discovery"));
  assert.ok(prepared.instructions.includes("Allow only public HTTPS destinations"));
  assert.ok(!prepared.instructions.includes("Allow only public HTTP or HTTPS"));
});

test("Meta inference permission is required before agent instructions are prepared", () => {
  const request = {
    ...userOnlyRequest,
    task: "research",
    usesUserMaterials: false,
    userMaterialsOnly: false,
    userProvidedSourceUrls: [parseUserProvidedPublicHttpsSourceURL("https://research.example.org/source")],
  };
  const blocked = prepareAgentTurn(request, new Set(["research.web.read"]));
  const ready = prepareAgentTurn(
    request,
    new Set(["research.web.read", "inference.meta.authorized"]),
  );

  assert.equal(blocked.status, "capability-unavailable");
  assert.ok(blocked.missingCapabilities.includes("inference.meta.authorized"));
  assert.ok(!("instructions" in blocked));
  assert.equal(ready.status, "ready");
  assert.ok(ready.instructions.includes("when the server has granted"));
  assert.ok(ready.instructions.includes("Never invent a source, quote, page, locator, or completed retrieval."));
  assert.deepEqual(
    ready.selectedSkills.map(({ id, version }) => ({ id, version })),
    ready.selectedSkillIds.map((id) => ({ id, version: 1 })),
  );
  assert.ok(ready.instructions.includes("Skill contract version: 1"));
});

test("source discovery cannot be satisfied by the known-URL reader", () => {
  const request = {
    ...userOnlyRequest,
    task: "research",
    usesUserMaterials: false,
    userMaterialsOnly: false,
    externalSourceMode: "automatic",
  };
  const plan = planEvidence(request, new Set(["research.web.read"]));

  assert.equal(plan.externalSourceMode, "discovery");
  assert.deepEqual(plan.requiredCapabilities, ["research.web.read", "research.web.discover"]);
  assert.deepEqual(plan.missingCapabilities, ["research.web.discover"]);
  assert.ok(plan.reasons.some((reason) => reason.includes("separate discovery capability")));

  const prepared = prepareAgentTurn(request, new Set(["research.web.read", "inference.meta.authorized"]));
  assert.equal(prepared.status, "capability-unavailable");
  assert.ok(prepared.missingCapabilities.includes("research.web.discover"));
  assert.ok(prepared.selectedSkillIds.includes("research.source-discovery"));
  assert.ok(!("instructions" in prepared));

  const discoverySkill = builtinAgentSkillsById.get("research.source-discovery");
  assert.ok(discoverySkill);
  assert.equal(
    activateSkills([discoverySkill], new Set(["research.web.discover"])).blocked[0]?.skill.id,
    "research.source-discovery",
  );
  assert.equal(
    activateSkills([discoverySkill], new Set(["research.web.read"])).blocked[0]?.skill.id,
    "research.source-discovery",
  );
  assert.equal(
    activateSkills(
      [discoverySkill],
      new Set(["research.web.read", "research.web.discover"]),
    ).available[0]?.id,
    "research.source-discovery",
  );
});

test("a user-provided validated URL is required to select reader-only mode", () => {
  const request = {
    ...userOnlyRequest,
    task: "research",
    usesUserMaterials: false,
    userMaterialsOnly: false,
    userProvidedSourceUrls: [parseUserProvidedPublicHttpsSourceURL("https://research.example.org/source")],
  };
  const plan = planEvidence(request, new Set(["research.web.read"]));

  assert.equal(plan.externalSourceMode, "known-url");
  assert.deepEqual(plan.requiredCapabilities, ["research.web.read"]);
  assert.deepEqual(plan.approvedUserSourceUrls, ["https://research.example.org/source"]);

  const userLimitsToSuppliedUrls = planEvidence(
    {
      ...request,
      task: "summarize",
      asksForSources: true,
      externalSourceIntent: resolveUserExternalSourceIntent("provided-only"),
    },
    new Set(["research.web.read"]),
  );
  assert.equal(userLimitsToSuppliedUrls.externalSourceMode, "known-url");
  assert.deepEqual(userLimitsToSuppliedUrls.requiredCapabilities, ["research.web.read"]);

  const suppliedURLSummary = planEvidence(
    {
      ...request,
      task: "summarize",
      asksForSources: false,
      externalSourceIntent: resolveUserExternalSourceIntent("provided-only"),
    },
    new Set(["research.web.read"]),
  );
  assert.equal(suppliedURLSummary.retrieval, "required");
  assert.equal(suppliedURLSummary.externalSourceMode, "known-url");
  assert.deepEqual(suppliedURLSummary.requiredCapabilities, ["research.web.read"]);

  const suppliedURLSummaryWithoutReader = planEvidence(
    {
      ...request,
      task: "summarize",
      asksForSources: false,
      externalSourceIntent: resolveUserExternalSourceIntent("provided-only"),
    },
    new Set(),
  );
  assert.equal(suppliedURLSummaryWithoutReader.retrieval, "required");
  assert.deepEqual(suppliedURLSummaryWithoutReader.missingCapabilities, ["research.web.read"]);

  const requestedAdditionalSources = planEvidence(
    {
      ...request,
      task: "summarize",
      asksForSources: false,
      externalSourceIntent: resolveUserExternalSourceIntent("discover-additional"),
    },
    new Set(["research.web.read", "research.web.discover"]),
  );
  assert.equal(requestedAdditionalSources.retrieval, "required");
  assert.equal(requestedAdditionalSources.externalSourceMode, "discovery");
  assert.deepEqual(requestedAdditionalSources.requiredCapabilities, [
    "research.web.read",
    "research.web.discover",
  ]);

  const forged = planEvidence(
    { ...request, userProvidedSourceUrls: [new URL("https://research.example.org/forged")] },
    new Set(["research.web.read", "research.web.discover"]),
  );
  assert.equal(forged.clarificationReason, "invalid-user-url");
  assert.equal(forged.retrieval, "clarify");
  assert.equal(forged.externalSourceMode, "none");

  const forgedIntent = planEvidence(
    { ...request, externalSourceIntent: { mode: "provided-only" } },
    new Set(["research.web.read", "research.web.discover"]),
  );
  assert.equal(forgedIntent.clarificationReason, "invalid-source-intent");
  assert.equal(forgedIntent.externalSourceMode, "none");

  const mutatedURL = parseUserProvidedPublicHttpsSourceURL("https://research.example.org/source");
  mutatedURL.hostname = "localhost";
  const mutated = planEvidence(
    { ...request, userProvidedSourceUrls: [mutatedURL] },
    new Set(["research.web.read", "research.web.discover"]),
  );
  assert.equal(mutated.clarificationReason, "invalid-user-url");
  assert.equal(mutated.retrieval, "clarify");

  const snapshotURL = parseUserProvidedPublicHttpsSourceURL("https://research.example.org/snapshot");
  const snapshotPlan = planEvidence(
    { ...request, userProvidedSourceUrls: [snapshotURL] },
    new Set(["research.web.read"]),
  );
  snapshotURL.hostname = "other.example.org";
  assert.deepEqual(snapshotPlan.approvedUserSourceUrls, ["https://research.example.org/snapshot"]);

  const forceDiscovery = planEvidence(
    { ...request, externalSourceIntent: resolveUserExternalSourceIntent("discover-additional") },
    new Set(["research.web.read"]),
  );
  assert.equal(forceDiscovery.externalSourceMode, "discovery");
  assert.ok(forceDiscovery.missingCapabilities.includes("research.web.discover"));

  const requestsAdditionalSources = planEvidence(
    { ...request, asksForSources: true },
    new Set(["research.web.read"]),
  );
  assert.equal(requestsAdditionalSources.externalSourceMode, "discovery");
  assert.ok(requestsAdditionalSources.missingCapabilities.includes("research.web.discover"));

  const providedOnlyWithoutURL = planEvidence(
    {
      ...request,
      userProvidedSourceUrls: [],
      externalSourceIntent: resolveUserExternalSourceIntent("provided-only"),
    },
    new Set(["research.web.read"]),
  );
  assert.equal(providedOnlyWithoutURL.clarificationReason, "missing-user-url");
  assert.equal(providedOnlyWithoutURL.retrieval, "clarify");

  const forgedPrepared = prepareAgentTurn(
    { ...request, userProvidedSourceUrls: [new URL("https://research.example.org/forged")] },
    new Set(["research.web.read", "research.web.discover", "inference.meta.authorized"]),
  );
  assert.equal(forgedPrepared.status, "clarification-required");
  assert.ok(forgedPrepared.question.includes("public HTTPS source"));
  assert.ok(!("instructions" in forgedPrepared));
});

test("every built-in skill exposes a positive versioned contract", () => {
  assert.ok(builtinAgentSkills.length > 0);
  assert.ok(builtinAgentSkills.every((skill) => Number.isSafeInteger(skill.version) && skill.version > 0));
  assert.equal(new Set(builtinAgentSkills.map((skill) => skill.id)).size, builtinAgentSkills.length);
});

test("source-scope clarification is returned before any inference instructions", () => {
  const prepared = prepareAgentTurn(
    {
      ...userOnlyRequest,
      task: "verify",
      explicitlyRequestsExternalVerification: true,
    },
    new Set([
      "documents.user.read",
      "research.web.read",
      "inference.meta.authorized",
    ]),
  );

  assert.equal(prepared.status, "clarification-required");
  assert.ok(prepared.question.includes("only the supplied material"));
  assert.ok(!("instructions" in prepared));
});

test("timeless explanation needs no source retrieval unless the request asks for it", () => {
  const plan = planEvidence(
    {
      ...userOnlyRequest,
      task: "explain",
      evidenceDomain: "general",
      usesUserMaterials: false,
      userMaterialsOnly: false,
    },
    new Set(),
  );

  assert.equal(plan.retrieval, "not-needed");
  assert.equal(plan.useExternalSources, false);
  assert.deepEqual(plan.requiredCapabilities, []);
});

test("retracted and unsupported sources are excluded; preprints and unknown methods remain limited", () => {
  const sources = [
    makeSource(),
    makeSource({
      sourceId: "source-preprint",
      sourceRole: "original-study",
      publicationStatus: "preprint",
      methodIsTransparent: "unknown",
      sponsoredOrMateriallyInterested: "unknown",
      independenceGroup: "shared-origin",
    }),
    makeSource({
      sourceId: "source-syndicated",
      sourceRole: "reputable-reported-analysis",
      methodIsTransparent: true,
      sponsoredOrMateriallyInterested: false,
      independenceGroup: "shared-origin",
    }),
    makeSource({ sourceId: "source-retracted", publicationStatus: "retracted" }),
    makeSource({ sourceId: "source-irrelevant", directlySupportsClaimIds: ["other-claim"] }),
  ];
  const report = reviewSourceQuality(sources, ["claim-a", "claim-without-evidence"]);

  assert.equal(report.reviews[0].disposition, "usable");
  assert.equal(report.reviews[1].disposition, "limited");
  assert.equal(report.reviews[1].corroboration, "shared-origin");
  assert.equal(report.reviews[2].disposition, "usable");
  assert.equal(report.reviews[2].corroboration, "shared-origin");
  assert.ok(report.reviews[2].corroborationLimitations[0].includes("not independent corroboration"));
  assert.ok(!report.reviews[2].limitations.some((limitation) => limitation.includes("independent corroboration")));
  assert.equal(report.reviews[3].disposition, "exclude");
  assert.equal(report.reviews[4].disposition, "exclude");
  assert.deepEqual(report.claimsWithoutUsableSupport, ["claim-without-evidence"]);
});

test("source usability is independent of corroboration status", () => {
  const single = reviewSourceQuality(
    [makeSource({ independenceGroup: undefined })],
    ["claim-a"],
  );
  assert.equal(single.reviews[0].disposition, "usable");
  assert.equal(single.reviews[0].corroboration, "unknown");
  assert.ok(single.reviews[0].corroborationLimitations[0].includes("independence"));
  assert.deepEqual(single.claimsWithoutUsableSupport, []);

  const shared = reviewSourceQuality(
    [
      makeSource({ sourceId: "shared-a", independenceGroup: "origin-shared" }),
      makeSource({ sourceId: "shared-b", independenceGroup: "origin-shared" }),
    ],
    ["claim-a"],
  );
  assert.ok(shared.reviews.every((review) => review.disposition === "usable"));
  assert.ok(shared.reviews.every((review) => review.corroboration === "shared-origin"));
  assert.deepEqual(shared.claimsWithoutUsableSupport, []);

  const distinct = reviewSourceQuality(
    [
      makeSource({ sourceId: "distinct-a", independenceGroup: "origin-a" }),
      makeSource({ sourceId: "distinct-b", independenceGroup: "origin-b" }),
    ],
    ["claim-a"],
  );
  assert.ok(distinct.reviews.every((review) => review.disposition === "usable"));
  assert.ok(distinct.reviews.every((review) => review.corroboration === "no-shared-origin-identified"));
  assert.deepEqual(distinct.claimsWithoutUsableSupport, []);
});

test("citations must resolve to the right owner, source version, role, and exact locator", () => {
  const sources = [makeSource()];
  const validCitation = makeWebCitation();
  const claims = [{ claimId: "claim-a", kind: "sourced-fact", citationIds: ["citation-a"] }];

  assert.deepEqual(
    validateClaimCitations({
      claims,
      citations: [validCitation],
      sources,
      expectedOwnerId: "user-a",
    }),
    [],
  );

  const issues = validateClaimCitations({
    claims: [
      ...claims,
      { claimId: "claim-b", kind: "sourced-fact", citationIds: ["missing-citation"] },
      { claimId: "claim-c", kind: "sourced-fact", citationIds: [] },
    ],
    citations: [
      makeWebCitation({ ownerId: "user-b" }),
      makeWebCitation({ citationId: "citation-b", sourceVersion: "stale" }),
      makeWebCitation({ citationId: "citation-c", sourceRole: "public-discussion" }),
      makeWebCitation({ citationId: "citation-d", sourceId: "deleted-from-index", sourceDeleted: true }),
      makeWebCitation({ citationId: "citation-e", sourceChangedSinceRetrieval: true }),
      makeWebCitation({ citationId: "citation-f", excerptEnd: 2 }),
      makeWebCitation({ citationId: "citation-http", url: "http://records.example.org/item" }),
    ],
    sources,
    expectedOwnerId: "user-a",
  });
  const codes = new Set(issues.map((issue) => issue.code));

  assert.ok(codes.has("wrong-owner"));
  assert.ok(codes.has("source-version-mismatch"));
  assert.ok(codes.has("source-role-mismatch"));
  assert.ok(codes.has("unknown-source"));
  assert.ok(codes.has("deleted-source"));
  assert.ok(codes.has("changed-source"));
  assert.ok(codes.has("excerpt-range-mismatch"));
  assert.ok(issues.some((issue) => issue.citationId === "citation-http" && issue.code === "invalid-source-url"));
  assert.ok(codes.has("unknown-citation"));
  assert.ok(codes.has("uncited-sourced-claim"));
});

test("private document citations require a document locator", () => {
  const excerpt = "Course passage";
  const citation = {
    citationId: "document-citation",
    sourceId: "document-a",
    ownerId: "user-a",
    sourceRole: "user-provided-document",
    sourceVersion: "file-sha256:version-a",
    excerptStart: 0,
    excerptEnd: excerpt.length,
    excerpt,
    sourceDeleted: false,
    sourceChangedSinceRetrieval: false,
  };
  const source = {
    sourceId: "document-a",
    sourceVersion: "file-sha256:version-a",
    sourceRole: "user-provided-document",
  };
  const claim = { claimId: "claim-a", kind: "sourced-fact", citationIds: ["document-citation"] };

  assert.deepEqual(
    validateClaimCitations({
      claims: [claim],
      citations: [citation],
      sources: [source],
      expectedOwnerId: "user-a",
    }).map((issue) => issue.code),
    ["missing-document-locator"],
  );
});
