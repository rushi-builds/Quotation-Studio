> **Archived / superseded.** The owner rejected this editorial direction. The current tracking-first workspace does not load its content editor, creative assistant or planner. See [tracking-research.md](tracking-research.md) and the current README for active capabilities and verification. The text below records historical research only.

# Growth Hub — research and implementation boundary

Research date: **21 October 2026**. These are public vendor descriptions, not independently verified product tests or an instruction to buy/integrate a service. The isolated preview is a design/workflow prototype, not a replacement for a deployed CRM or social scheduler.

## References reviewed

1. Owner's SparrowCRM workspace: https://ktm-energy-experts.sparrowcrm.com/contacts — redirected to a login screen. **No private contacts, account configuration or authenticated layout was inspected. No login attempted.**
2. SparrowCRM public site: https://www.sparrowcrm.com/ and help centre https://support.sparrowcrm.com/hc/en/ — public product positioning connects contacts/companies/deals, conversation context, work organisation, automation and reporting. Do not confuse this vendor with `getsparrowcrm.com`, which was not used as a product reference.
3. Bigin landing page supplied by owner: https://www.bigin.com/lp/first-crm-solution.html — positions a simple business CRM around deals, customer communication and follow-ups. Tracking/ad parameters were unnecessary for research and omitted.
4. Bigin quick-start guide: https://www.bigin.com/quick-start-guide.html — separates Contacts from Pipelines, links relationships/activities, and describes leads arriving through multiple sources. Features: https://www.bigin.com/features/
5. Bigin AI: https://www.bigin.com/ai.html — describes writing assistance and record/conversation summaries among its AI capabilities. This is inspiration for bounded, contextual assistance, not evidence that our preview has an AI integration.
6. Buffer Create/Publish: https://buffer.com/create and https://buffer.com/publish — separates content ideas from channel-tailored drafts, planning and publishing. Publishing and actual account connections are distinct from a local editorial calendar.
7. Buffer AI help: https://support.buffer.com/article/583-using-buffers-ai-assistant — describes prompt-based drafting, ideation and repurposing; reinforces that genuine AI output needs a real model integration. Analytics: https://support.buffer.com/article/602-getting-started-with-buffers-analytics-features — account/post measurements, not numbers to invent for a disconnected preview.

## What this changes for KTM

**Name: Growth Hub.** The former Sales & Marketing preview was too quotation-centric. This version keeps the familiar Dashboard and uses the same single sidebar slot, but models the whole business lifecycle: **content → conversations → customers**. Quotation analytics remains contextual to Quotations and its summary/comparison is preserved.

| Area | Useful working preview | Deliberately not claimed |
| --- | --- | --- |
| Overview | Independent CRM/editorial counts, enquiry/review actions, source mix | Revenue uplift, win scores, scraped account insights |
| Contacts | Separate fictional business people/organisations; optional email/phone; service/source/owner/stage; list/pipeline; search/filter; notes/history/next step; duplicate guard; filtered formula-safe CSV | Sparrow/Bigin import/sync, verified identities, consent inferred from source, outbound messages |
| Content studio | Service/audience/channel/objective/language/theme brief; editable English/Hinglish starter; caption preview; 1080×1350 cover SVG and caption TXT downloads; draft upsert | AI-generated copy/art, a finished multi-slide carousel or edited video, automatic fact verification |
| Creative assistant | Contextual caption, reel-script and seven-day campaign prompts; copy/TXT export; explicit claim/asset/consent guardrails | A connected LLM, live AI generation, autonomous agents |
| Planner | Seven-day navigation, channel filter, review → sample approval → future local plan, explicit IST; editing invalidates approval/plan | Server scheduler, publishing, notifications, production role authorisation |
| Insights | Current recorded source/stage counts; disconnected-channel requirements; unavailable reach/clicks shown as dashes | Real ad attribution, conversion cohorts, follower growth, campaign ROI |

All CRM/editorial examples are explicit separate fixtures, **not copied from quotation records**. All changes live in memory and disappear on reload. Storage sandbox/CSP remain unchanged and connections blocked; no secrets or real account access requested. Existing assistant, Finance, BESS, CloudBridge and original Dashboard controllers are not modified.

## What genuine production capability would need

This is an implementation boundary, not an approved master backlog or deployment authorisation:

- Owner-approved CRM system of record, schema, permission-scoped persistence, migration/import mapping, deduplication and audit trail. Do not create a silent second live contact database alongside Sparrow/Bigin.
- Company-owned social accounts; approved server-side OAuth/API integration, supported account/format/permission verification, secure tokens and any required platform review. No passwords in this UI.
- Rights-cleared media, versioned approval, reliable publishing queue, idempotency/duplicate protection, retry/failure log and platform-specific validation.
- An approved AI provider with server-side credentials, cost controls, approved context, output/fact review, privacy controls and explicit human approval before external actions.
- Validated source events and measurement definitions before showing attribution, spend, conversions or ROI. Direct marketing additionally needs an actual consent/opt-out record.

Owner review of this preview does not authorise any of the above connections, merges or production deployments.

## Verification

**96 Growth Hub browser checks + 58 existing summary checks + 16 Dashboard checks = 170 PASS.** Includes standalone CRM, optional contact data, deduplication, note/SVG escaping, filtered/formula-safe CSV, actual SVG/TXT/clipboard outputs, task-specific AI prompts, draft upsert, approval gates, past-time rejection, IST planning, editing resets, keyboard/native modal paths, direct/legacy routes, contextual Analytics, desktop/390px/768px and genuine Dark appearance. Zero API/external requests or browser errors. Original frozen hashes and unrelated tracked patch verified unchanged.

The superseded `sales-workspace.js` / `sales-workspace-test.cjs` are retained as historical prototype files but are **not loaded/current QA**. Only its CSS remains loaded for the preserved contextual Analytics control; inactive `.sales-workspace` rules do not style Growth Hub.
