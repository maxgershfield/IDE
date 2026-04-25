# Holonic genomic medicine proposal (OASIS)

**Slug:** `holonic_genomic_medicine_proposal`


---

## 1. The real bottleneck in genomics (no platform jargon)

Meaningful genomic research is rarely “one VCF file and done.” A credible story usually spans:

- who or what is being studied (participants, cohorts, families, cells),
- what was collected (consent, samples, assays, sequencing runs),
- what the genome and variants are (and under which reference and pipeline),
- what was observed in the person or in the lab (phenotype, response, function),
- and how conclusions were reached (evidence, models, review, and limitations).

In practice, those pieces live in different silos, spreadsheets, lab LIMS, storage buckets, and notebook outputs. The hard part is not only compute, it is **keeping a defensible, reusable chain** from raw material to claim: *what was true, with what permissions, on what data, in what order, and who is willing to sign off.*

This proposal is about that chain.

---

## 2. What “Holon” means here, in one page

Section 1 said genomic work needs a **defensible chain** from material and permission to result. **Holons are the pieces of that chain, kept as first-class things you can name, look up, and connect**, instead of burying the same facts in ad hoc files, extra spreadsheet columns, or unlabeled paths in a bucket.

The word comes from a simple idea in systems thinking: a **“holon” is something that is a whole in its own right, and at the same time a part of something larger**. A sample is a whole object (it has its own id and story) and a part of a study. A variant call is a whole object, and a part of a person’s larger genomic and clinical picture. The name is shorthand for: *we are serious about that part/whole relationship, and we are not going to model everything as a single flat table.*

**What a Holon is, in one sentence:** a **Holon** is a **named kind of object** in a research program (a participant pseudonym, a sample, a consent, a variant set, a bit of evidence, and so on) that the system stores as its **own record**, with a stable identity, a clear type, and **links** to other objects in one shared graph. You stop copying the same “patient-ish” string into twelve places and start pointing to **one** object everyone agrees on.

**Why we bother:** when every important concept is a Holon, a question like “where did this variant call come from, and were we allowed to use it for this task?” becomes a path through the graph, not a scavenger hunt through someone’s email.

The table below is a quick read on what that buys you in genomics, before we list concrete examples in the next section.

**Holon** in plain language | Why it helps genomics
---|---
**Typed** | A “sample” and a “variant” are not the same table row with extra columns, they are different concepts with different rules and lifecycles.
**Linked** | A variant call is tied to a genome, which is tied to a sample, which is tied to consent, which is tied to a study. You can walk that path when you need to prove something.
**Versioned** | Science changes. A Holon can carry provenance, pipeline names, and references so the next team knows what *this* record is about.
**Governed** | Consent and data-use can be first-class **objects**, not a PDF that lives in someone’s inbox. Workflows can ask, “is this use allowed for this data?”

Nothing in that definition requires blockchain, tokens, or a specific vendor. The claim is **conceptual first**: a shared object model and graph that matches how real genomic programs think.

**What Holons are not (important):** Holons do not replace a sequencer, a clinical EHR, or a regulated diagnostic device. They are a way to keep **agreed meaning and relationships** in one place, while heavy files and clinical systems remain where your institution already puts them.

---

## 3. How Holons support genomic research (concrete)

Below is a minimal, intuitive set of “things” a program might model as Holons. The names are illustrative; a real program would pick the set that matches its science and policy.

- **Cohort and participant (de-identified):** the population you can talk about in aggregate and the people or pseudonyms in it, without mixing identifiers into every analysis table.
- **Consent and data-use:** what is allowed (research, sharing, re-contact), what is not, and what happens on withdrawal or scope change. This is the first place governance meets data.
- **Sample and aliquot:** the physical or logical specimen chain, including custody handoffs that matter in audits.
- **Genome record and variant set:** a stable handle for “this is the gVCF from pipeline X, reference Y,” not just a path in object storage. Large files can stay in approved storage, while the Holon holds the pointer, hash, and metadata an auditor expects.
- **Phenotype and outcome:** what was measured, when, and with what confidence, linked to the same participant story as the genome.
- **Study, protocol, and eligibility:** the rules of a trial or research study, connected to the cohorts and outcomes you evaluate against.
- **Evidence and claims:** a structured “here is what we concluded, from what, under what review,” rather than a slide deck that can drift from the data.

**The payoff:** teams can run analyses on modern infrastructure while still **navigate** from a variant back to a consent, or from a new finding forward to a reproducible evidence object. That is the difference between “a pipeline ran” and “a pipeline ran *and* we can explain it under scrutiny.”

**Human genomics caveat:** the same object model is useful for *research* and for *care-adjacent* work, but clinical claims, prescribing, and regulated diagnostics require their own process and should not be conflated with a research graph.

---

## 4. How an IDE makes Holons easier to *use* (not only to build)

A graph of Holons in a database is not automatically friendly. Researchers still need a place to:

- **see** what exists (cohorts, consents, samples, genomes, phenotypes),
- **link** new records without breaking graph rules,
- **dry-run** a workflow (annotation, triage, trial match) on safe or synthetic data first,
- **separate** “I am exploring” from “I am making durable changes or publishing”,
- **teach a team** with guided flows, not a ticket queue of API keys.

**OASIS-IDE** is a desktop development environment in this world: a **cockpit** to author and operate Holon-based workflows, inspect graphs, and package reusable “how we do this” recipes for a lab, without every scientist becoming an integration engineer.

In plain terms, the IDE adds:

1. **One connected workspace** where a single conversation can stay grounded in the same Holon ids, graph, and environment, instead of jumping between ad hoc scripts.
2. **A safety habit:** read-only or plan-style exploration for discovery, and explicit “execute” steps for actions that should leave an audit trail, match local policy, and avoid accidental cross-environment mistakes.
3. **Repeatable “recipes”** (documented, copyable flows) for common sequences: create a cohort object, add consent, attach a genome handle, add phenotype, record evidence. That is how a small team onboards a larger team.
4. **Visibility:** graph-style views, status of connections, and exports that a PI or partner can read without opening five tools.

**Boundary that must stay clear:** the IDE is for **authoring, inspection, and demos**. Long-running production jobs, always-on schedulers, and the authoritative database still live in platform services your institution and security team can operate and sign off on, not in a local developer session by default.

---

## 5. The story you can tell a non-technical funder, PI, or clinic partner (three sentences)

1. We model genomic research as **objects with types and links**, the same way people already reason, instead of a pile of unconnected files.  
2. We store **governance and provenance in that graph**, not only results.  
3. We use an **IDE cockpit** so teams can build, inspect, and run those workflows without losing the thread between a variant and a consent, or a claim and the evidence that supports it.

---

## 6. Scenarios, without assuming you have read a stack diagram

**Data commons, metadata-first**  
A shared view of de-identified cohort, consent, sample, genome, and phenotype **handles**, with links and audit-friendly summaries. Raw files remain in approved systems.

**Interpretation loop (research, not a diagnosis product)**  
An evidence object records: inputs, model or pipeline, human review, limitations, and explicit “not a clinical order” labels where appropriate.

**Matchmaking to studies**  
A trial and eligibility objects connect cohort rules to participant facts at the level your ethics board allows, without pretending the graph replaces a clinical trial office.

**Sharing methods, not only numbers**  
Packages that describe the schema, consent model, and workflow steps, so other sites can *reuse the approach* on their own data under their own policy.

In each case, the Holon graph is the **narrative backbone**; the IDE is where people **see and run** that story without a bespoke portal per project.

---

## 7. Glossary: OASIS terms, only when you need them

Term | One-line meaning
---|---
**OASIS** | The platform that hosts Holon stores, identity, and APIs used by the IDE, under your deployment.
**Holon** | A typed, linkable research object, as in section 2.
**OASIS-IDE** | The desktop IDE for Holon-based authoring, graph inspection, and guided workflows, as in section 4.
**STAR** | A sibling part of the stack for application packaging, publishing, and Star-side objects (Zomes, OAPPs) when you are ready to distribute reusable shells.
**STARNET** | A registry and discovery path for those published application packages and related Star assets.
**MCP** | A standard “tool bridge” so the IDE can call platform actions (save Holon, list Holon, run a Star action) in a consistent way, instead of ad hoc HTTP per feature.
**OAPP** | An application **package** format in the Star world. Useful for “ship the method and schema as an installable template,” not for patient charts.
**A2A** | Agent-to-agent style calls for specialist services (annotation, triage) when you adopt them with governance.
**CRE** | Workflow orchestration **outside the IDE** for long-running, scheduled, or event-driven pipelines, once a workflow is no longer a lab script you run by hand.
**HyperDrive** | A multi-provider data routing layer, when you need large blobs addressed consistently across systems.

This glossary is here so the rest of the document can stay clean. A reader can stop at section 5 and still have the point.

---

## 8. Catalogue of example Holon types (reference)

These sections keep the same intent as a schema draft, in reader-friendly form.

### Cohort, participant, consent, sample, genome, variant, phenotype, study, evidence, hypothesis (summaries)

**Participant (de-identified):** internal pseudonym, cohort membership, approved attributes, and links to consent.  
**Cohort:** who is in, inclusion and exclusion, policies.  
**Consent:** what is allowed, for how long, and what happens if scope changes.  
**Sample and chain of custody:** from collection through lab, as your governance requires.  
**Genome record / variant set:** handle to files or tables, with reference, pipeline, and quality metadata.  
**Phenotype or outcome:** measurements and timing, with provenance.  
**Clinical or research study:** rules you evaluate against, linked to eligibility logic when appropriate.  
**Evidence record:** a durable “outputs from step X, inputs Y, method Z, reviewer R.”  
**Hypothesis (research or decision-support):** explicit about review status, never presented as a silent medical order.

---

## 9. Governance, in plain terms

- **De-identify by design in shared surfaces.** The Holon is often metadata and pointers, not a bucket for uncontrolled PHI.  
- **Consent before mutation or export** that would widen use or re-identify.  
- **Distinguish** research insight, decision support, and regulated clinical action. The graph should be able to label the difference.  
- **Audit the machine-assisted steps** the same way you audit an assay: who ran what, on which Holon ids, with which model version, and with what human check.

---

## 10. A phased plan (outcomes for humans, not acronyms)

1. **Foundations:** a published Holon schema, consent object rules, and a synthetic demo you can run end to end.  
2. **IDE cockpit:** browse, create links, and run a documented recipe on the demo, with clear “plan” vs “execute” habits.  
3. **Pipelines in the open:** evidence objects that point to the exact graph inputs and methods.  
4. **Scale-out:** long-running and scheduled work moves to a server-side orchestration layer, while the IDE remains the place to author and inspect.  
5. **Distribution:** when ready, share **methods and OAPP-style packages** so other sites can reuse the approach, not the raw data.

---

## 11. First proof of concept (minimum credible demo)

**Synthetic or approved de-identified metadata only in public demos.**  
1. Cohort, consent, sample, genome, phenotype, linked in one graph.  
2. A single interpretation or triage path that **writes** an evidence Holon with clear limitations.  
3. A one-page “what we can claim” partner summary, grounded in those Holon ids, not a slide without backing objects.

This proves the idea without claiming a regulated diagnostic, a new sequencer, or an EHR replacement.

---

## 12. Risks (stated for a general audience)

- **Re-identification and data misuse:** mitigate with de-identified defaults, strict link rules, and no casual export.  
- **Overclaiming:** the graph supports evidence; it does not, by itself, make a therapy safe or a trial result complete.  
- **Automation without oversight:** any agent or model step should be wrapped in the same review and consent gates as a serious lab protocol.

---

## Appendix A: for engineers, where the IDE code touches this story

**Only if you are implementing inside this repo:** OASIS-IDE already has authenticated API access, a unified tool bridge, Plan vs Execute gating, STARNET-oriented UI for catalog and publish, and recipe files under `docs/recipes/`. The implementation map belongs in build notes, not in the first ten pages of a public proposal.

- Tool allowlisting and read-only “plan” behaviour: `OASIS-IDE/src/main/services/agentMcpAllowlist.ts` and `AgentToolExecutor` (MCP `mcp_invoke` path).  
- Context text for the assistant: `OASIS-IDE/src/shared/agentContextPack.ts`.  
- STARNET UI: `OASIS-IDE/src/renderer/components/Starnet/`.

**Appendix B: glossary cross-reference to implementation** is intentionally tiny here. Add links to your internal Confluence or architecture repo when you circulate this outside the git tree.

---

**Closing line (non-technical):** Holons give genomics a **shared, typed story** of participants, data, and evidence. The IDE gives teams a **safe, visible way to work inside that story**, without every researcher wiring bespoke integrations. Platform names are optional. The object model and the work habits are not.
