# Already using Purview Compliance Manager? You still need device evidence.

Compliance Manager tracks your regulation. Intune Documentation proves how your devices are configured.

Microsoft Purview Compliance Manager gives you regulatory templates, improvement actions and a workflow with owners. For controls about data, it can test many things automatically. For controls about devices, it cannot. Compliance Manager does not read your Intune configuration profiles, Settings Catalog policies, device compliance policies or endpoint security policies, and there is no Intune connector for its automated testing. For device controls, your team has to find the evidence and upload it by hand.

Intune Documentation does that work for you. It reads the real settings in your Intune tenant and turns them into evidence you can attach in minutes.

## What you get

- **Proof, setting by setting.** For every mapped control: the policy, the exact setting, the expected value, the actual value, and whether the policy is assigned. Configured but not assigned does not count.
- **A Purview evidence pack, ready to attach.** The desktop app saves one ZIP with the framework evidence PDF, the JSON evidence record, an index that lists every assessed control with the matching Purview template name and where to find it in the PDF, and upload instructions, plus an Excel and CSV evidence register for your own tracking. There are no per-control PDFs. You attach the ZIP, or the framework PDF from it, to the related improvement action.
- **Documentation people can read.** As built Word and PDF documents of your policies, settings and assignments, and framework evidence PDFs for auditors, insurers and customer questionnaires.
- **Change you can show.** Local snapshot history with change tracking (encrypted on your computer, off by default), scheduled collection while the app is open, a reference comparison against a known good tenant or snapshot, and an MSP portfolio overview across tenants, all in the desktop app.
- **More context next to the evidence.** Intune's per-policy device status counts sit next to the evidence without changing any status. The tenant authentication methods policy and security defaults are read with the Conditional Access permission that is already granted, and screen lock counts as supporting evidence. For safeguards with no evidence at all, a draft fix pack gives you unassigned draft policies to review.
- **Your data stays yours.** The desktop app runs on your computer and keeps tenant data on your machine, including the optional encrypted history. It only reads. It never changes your tenant.

## At a glance

|  | Purview Compliance Manager | Intune Documentation |
| --- | --- | --- |
| Best at | Running the full assessment: 360+ templates, organisational and nontechnical controls, owners and due dates, continuous testing every 24 hours for Microsoft 365 data controls | Reading your Intune tenant and showing which exact settings evidence each device control |
| Reads Intune policies and settings | No | Yes, with setting ids, values and assignment |
| Evidence for device controls | You collect it and upload a file on the improvement action | Built for you: the framework evidence PDF in one ZIP with an index of controls, plus an Excel and CSV register |
| Output | Your assessment record in Microsoft 365 | As built Word and PDF documentation, framework evidence PDFs and the Purview evidence pack |

The two are complementary. Keep Compliance Manager as your control register, and use Intune Documentation as the source for the device configuration evidence it asks for. One note for planning: Purview premium templates are licensed per regulation family, and Microsoft 365 E5, A5 and G5 plans include three premium templates.

## How they work together

1. **Assess.** Collect your tenant in Intune Documentation and assess it against the framework in your Compliance Manager assessment. Fix missing or conflicting settings first if you can.
2. **Save the evidence pack.** In the desktop app, export the Purview evidence pack and, if you track work in a spreadsheet, the Excel or CSV evidence register.
3. **Attach.** In Compliance Manager, open each device related improvement action, go to the Evidence tab, and upload the pack ZIP, or the framework PDF from it. The index in the pack says where each control is covered in the PDF. Check the control id against the template in your tenant, then record the outcome your team decides on.

When configuration changes, collect again, export a fresh pack, and update the affected evidence. Snapshot history shows what changed between the two rounds.

A related Microsoft capability worth knowing: Microsoft Entra Tenant Governance can snapshot Intune configuration and watch for drift, in JSON form, with no framework mapping. Intune Documentation covers the readable side of that story: framework aware evidence, auditor ready documents, and a longer history held locally on your machine.

## The short version

Purview tells you what a regulation asks for and tracks who owns each action. Intune Documentation gathers the device configuration evidence those actions ask for, from the actual settings in your tenant, so nobody has to build it from screenshots and spreadsheets.

Intune Documentation produces evidence to support your assessment. It does not certify your organisation, and no tool output replaces your own review or your auditor's judgement.

Keep the register in Purview. Let Intune Documentation do the evidence legwork.
