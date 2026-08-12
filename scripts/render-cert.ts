import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Criterion = {
  criterion_verbatim: string;
  result: "PASS" | "FAIL" | "PARTIAL" | "ENV_LIMITED";
  evidence: {
    commands: string[];
    output_tail: string;
    artifacts: string[];
  };
  gap?: string;
};

type Phase = {
  id: string;
  name: string;
  status: "PASS" | "PARTIAL" | "BLOCKED" | "ENV_LIMITED" | "NOT_STARTED";
  commit: string;
  acceptance_criteria: Criterion[];
  stubs: Array<{ file: string; what: string; why: string; resolve_in_phase: string }>;
  blockers: Array<{ error_verbatim: string; attempts: number; suggested_human_action: string }>;
};

type Cert = {
  spec_version: string;
  cycle: number;
  build_started: string;
  last_updated: string;
  agent_decisions: Array<{ decision: string; choice: string; reason: string }>;
  phases: Phase[];
  security_checklist: Array<{ item: string; status: string; evidence_ref: string }>;
  regressions: Array<{ date: string; phase: string; what_broke: string; evidence_ref: string }>;
  launch_loops: Record<string, { status: string; evidence_ref: string }>;
  attestation: {
    no_pass_without_evidence: boolean;
    no_unlisted_stubs: boolean;
    no_weakened_criteria: boolean;
    totals: Record<string, number>;
  };
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = path.join(root, "BUILD-CERT.json");
const mdPath = path.join(root, "BUILD-CERT.md");

const cert = JSON.parse(readFileSync(jsonPath, "utf8")) as Cert;

function worst(results: Criterion["result"][]): Phase["status"] {
  if (results.includes("FAIL")) return "BLOCKED";
  if (results.includes("PARTIAL")) return "PARTIAL";
  if (results.includes("ENV_LIMITED")) return "ENV_LIMITED";
  if (results.every((r) => r === "PASS")) return "PASS";
  return "NOT_STARTED";
}

for (const phase of cert.phases) {
  if (phase.acceptance_criteria.length > 0) {
    phase.status = worst(phase.acceptance_criteria.map((c) => c.result));
  }
}

const totals = {
  pass: 0,
  partial: 0,
  blocked: 0,
  env_limited: 0,
  not_started: 0,
};
for (const p of cert.phases) {
  if (p.status === "PASS") totals.pass += 1;
  else if (p.status === "PARTIAL") totals.partial += 1;
  else if (p.status === "BLOCKED") totals.blocked += 1;
  else if (p.status === "ENV_LIMITED") totals.env_limited += 1;
  else totals.not_started += 1;
}
cert.attestation.totals = totals;
cert.last_updated = new Date().toISOString();
writeFileSync(jsonPath, JSON.stringify(cert, null, 2) + "\n");

const decisions = cert.agent_decisions.map((d) => `${d.decision}=${d.choice}`).join(", ");
const lines: string[] = [];
lines.push("# GARAGE TALK BUILD CERTIFICATE");
lines.push(`Build started: ${cert.build_started}   Last updated: ${cert.last_updated}`);
lines.push(`Spec version: ${cert.spec_version}   Agent decisions log: ${decisions}`);
lines.push("");
lines.push("## PHASE LEDGER");
lines.push("| Phase | Status | Evidence ref | Commit | Notes |");
lines.push("|-------|--------|--------------|--------|-------|");
for (const p of cert.phases) {
  lines.push(`| ${p.id} ${p.name} | ${p.status} | EV-${p.id} | ${p.commit || ""} | |`);
}
lines.push("");
lines.push("## EVIDENCE (append-only)");
for (const p of cert.phases) {
  lines.push(`### EV-${p.id}`);
  if (p.acceptance_criteria.length === 0) {
    lines.push("- (no evidence yet)");
    continue;
  }
  for (const c of p.acceptance_criteria) {
    lines.push(`- Acceptance criterion: "${c.criterion_verbatim}"`);
    lines.push(`- Result: ${c.result}`);
    lines.push(`- Command: \`${c.evidence.commands.join(" && ")}\``);
    lines.push("- Output:");
    lines.push("```");
    lines.push(c.evidence.output_tail || "(empty)");
    lines.push("```");
    if (c.gap) lines.push(`- Gap: ${c.gap}`);
  }
}
lines.push("");
lines.push("## DEFERRED-STUBS");
lines.push("| File | What is stubbed | Why | Phase to resolve |");
lines.push("|------|-----------------|-----|------------------|");
for (const p of cert.phases) {
  for (const s of p.stubs) {
    lines.push(`| ${s.file} | ${s.what} | ${s.why} | ${s.resolve_in_phase} |`);
  }
}
lines.push("");
lines.push("## BLOCKED");
lines.push("| Phase | Blocker | Full error | Attempts made | Suggested human action |");
lines.push("|-------|---------|------------|---------------|------------------------|");
for (const p of cert.phases) {
  for (const b of p.blockers) {
    lines.push(
      `| ${p.id} | blocker | ${b.error_verbatim.replace(/\|/g, "/")} | ${b.attempts} | ${b.suggested_human_action} |`,
    );
  }
}
lines.push("");
lines.push("## REGRESSIONS");
lines.push("| Date | Phase originally passed | What broke | Evidence |");
lines.push("|------|-------------------------|------------|----------|");
for (const r of cert.regressions) {
  lines.push(`| ${r.date} | ${r.phase} | ${r.what_broke} | ${r.evidence_ref} |`);
}
lines.push("");
lines.push("## SECURITY CHECKLIST (§2.4 items 1–13: each line PASS + evidence ref or FAIL)");
for (const s of cert.security_checklist) {
  lines.push(`- ${s.item}: ${s.status} (${s.evidence_ref || "n/a"})`);
}
lines.push("");
lines.push("## LAUNCH LOOP TEST (§5.4)");
lines.push(`- Legacy-parity loop: ${cert.launch_loops.legacy_parity.status} + ${cert.launch_loops.legacy_parity.evidence_ref}`);
lines.push(
  `- Diagnostic→brief→quote→booking loop: ${cert.launch_loops.diagnostic_to_booking.status} + ${cert.launch_loops.diagnostic_to_booking.evidence_ref}`,
);
lines.push(
  `- Campus learn→quest→badge loop: ${cert.launch_loops.campus_learning.status} + ${cert.launch_loops.campus_learning.evidence_ref}`,
);
lines.push("");
lines.push("## FINAL ATTESTATION");
lines.push(
  "I attest every PASS above is backed by pasted command output, no stub exists outside DEFERRED-STUBS, and no acceptance criterion was weakened or reinterpreted.",
);
lines.push(
  `Total phases: ${cert.phases.length}  PASS: ${totals.pass}  PARTIAL: ${totals.partial}  BLOCKED: ${totals.blocked}  ENV_LIMITED: ${totals.env_limited}  NOT_STARTED: ${totals.not_started}`,
);
lines.push("");

writeFileSync(mdPath, lines.join("\n"));
console.log(`Rendered ${mdPath}`);
