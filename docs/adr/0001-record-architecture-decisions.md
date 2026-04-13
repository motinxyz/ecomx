# 1. Record Architecture Decisions

*   **Status:** Accepted
*   **Date:** 2026-04-11
*   **Deciders:** Core Engineering Team

## Context and Problem Statement
As the Ecomx monorepo scales, many developers and engineering teams will contribute concurrently. Without a historical record, new developers will inevitably reverse previous architectural decisions, leading to circular debates (e.g., "Why are we using Bun instead of Node?", "Why did we write this custom plugin?"). We need a standardized process to record *why* sweeping structural decisions were made to preserve the integrity of the monorepo.

## Decision Drivers
*   Preventing redundant arguments over past decisions (Wiki rot).
*   Onboarding velocity for new engineers.
*   Enforcing technical discipline before making monorepo-wide structural shifts.

## Considered Options
*   **Confluence / Notion Wikis**: Rejected because they disconnect from the codebase. Code drifts while wikis rot.
*   **PR Descriptions**: Rejected because they are difficult to search a year later, and the rationale gets buried in thousands of commits.
*   **Markdown Architecture Decision Records (ADR)**: Accepted because they sit directly inside the repository (`docs/adr/`), are version controlled, and undergo the exact same peer-review process as the code they govern.

## Decision Outcome
Chosen option: **Markdown Architecture Decision Records (ADR)**. 

All major architectural changes must be proposed using the template at `docs/adr/template.md`. The document number (e.g. `0001`) must increment sequentially.

### Positive Consequences
*   The "Why" of the code lives natively next to the code.
*   We establish a high-engineering standard preventing random structural drifts.

### Negative Consequences
*   Introduces slight friction (writing a document) before a dev is allowed to introduce a radical new paradigm or dependency. (This is arguably a positive consequence).
