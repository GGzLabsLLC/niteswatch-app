# 🛡️ Nite's Watch Moderation Guidelines (v1.1)

## Mission

Nite's Watch is built for people who are awake late at night—often vulnerable, bored, or just looking for connection.
Moderation exists to **protect that environment without over-controlling it**.

The goal is to:

* reduce harm
* keep conversations usable
* act consistently
* log decisions clearly
* escalate patterns, not just single moments

---

## 1. Core Principles

Moderation decisions should be based on:

### Impact

Does this make the room less safe, less welcoming, or harder to use?

### Severity

Is this mildly disruptive, clearly abusive, or immediately harmful?

### Pattern

Is this a one-off message or part of repeated behavior?

---

## 2. Enforcement Ladder

### 🟢 Level 0 — No Action

Use when:

* Content does not violate guidelines
* Report is mistaken or lacks context

Actions:

* Dismiss report
* Optional moderator note

---

### 🟡 Level 1 — Warn

Use when:

* User crosses tone boundaries
* Mild harassment or spam
* Disruptive but not severe behavior

Actions:

* Warn user
* Save moderator note

Goal:

* Correct behavior early

---

### 🟠 Level 2 — Hide

Use when:

* Content should not remain visible
* Multiple users report the message
* Harassment or offensive language is present

Actions:

* Hide message
* Optional warning
* Save moderator note

Notes:

* Hidden content is still visible to moderators
* Action is reversible

---

### 🔴 Level 3 — Delete

Use when:

* Content is clearly unacceptable
* Severe abuse or harmful material

Actions:

* Soft delete message
* Save moderator note
* Usually warn or escalate user

Examples:

* Hate speech
* Threats
* Sexual exploitation content
* Severe targeted abuse

---

### ⚫ Level 4 — Escalate

Use when:

* Repeat offender behavior
* Safety concerns
* Pattern of violations

Actions:

* Escalate report
* Attach moderator note
* Preserve history for further action

Future:

* Suspension
* Restrictions
* Account-level enforcement

---

## 3. Severity Categories

### Low Severity

* Mild insults
* Spam
* Annoying behavior

→ Typically **Warn**

---

### Medium Severity

* Targeted harassment
* Abusive tone
* Repeated inappropriate comments

→ Typically **Hide + Warn**

---

### High Severity

* Threats
* Hate speech
* Exploitation
* Self-harm encouragement

→ Typically **Delete + Escalate**

---

## 4. Auto-Moderation Rules

### Auto-Hide Threshold

* 3 or more open reports → message is automatically hidden

Purpose:

* Quickly reduce harm
* Allow moderators to review after

---

### Repeat Offender Flag

User is flagged when:

* 3+ warnings
* Multiple moderated messages

System Behavior:

* Badge in admin UI
* Higher priority in report queue

---

## 5. Prohibited Content

The following is not allowed and usually requires immediate action:

* Hate speech
* Threats or intimidation
* Targeted harassment
* Sexual exploitation content
* Encouragement of self-harm
* Malicious impersonation
* Spam campaigns

---

## 6. Context-Based Content

Allowed depending on context:

* Profanity
* Sarcasm
* Dark humor
* Emotional venting

Rule:
Content is only moderated if it **causes harm, targets others, or disrupts safety**.

---

## 7. Moderator Decision Guidelines

When unsure:

* Prefer **Warn** over harsh punishment for first-time issues
* Prefer **Hide** over leaving harmful content visible
* Use **Notes** to document uncertainty
* Escalate when pattern matters more than one message

Key Principle:

> A single message may be a mistake.
> A pattern defines behavior.

---

## 8. Moderator Notes Standard

Notes should be:

* short
* factual
* useful for future decisions

Good Examples:

* "3 reports within 10 minutes, hostile tone"
* "Repeat behavior, prior warning issued"
* "Auto-hidden at threshold, reviewed and confirmed"

Avoid:

* emotional language
* vague statements
* personal opinions

---

## 9. Audit Logging Requirements

Every moderation action should log:

* reportId
* messageId
* targetUserId
* moderatorId
* actionType
* timestamp
* reason
* optional note

Action types include:

* warn
* hide
* unhide
* delete
* dismiss
* review
* escalate
* note

---

## 10. Admin UI Contract

### Report Queue Must Show:

* report reason
* status
* report count
* user
* repeat offender badge
* message state

### Report Detail Modal Must Show:

* reported message
* report reasons
* user moderation history
* warning count
* prior actions
* moderator notes

### Action Buttons:

* Warn User
* Hide / Unhide Message
* Delete Message
* Save Note
* Dismiss Report
* Escalate Report

---

## 11. User Moderation History

Track:

* total warnings
* hidden messages
* deleted messages
* escalations
* last action timestamp

Purpose:

* inform moderator decisions
* detect repeat offenders

---

## 12. Moderator Playbook

### Mild Issue

→ Warn + Note

### Harmful Message

→ Hide + Note

### Severe Violation

→ Delete + Escalate

### Repeat Offender

→ Stronger action faster

### False Report

→ Dismiss

---

## 13. Internal Thresholds

* 3 reports → auto-hide
* 3 warnings → repeat offender
* multiple deletions → escalate candidate

---

## 14. Core Policy Summary

* Warn for behavior correction
* Hide for harmful visibility
* Delete for severe violations
* Escalate for patterns or safety risks
* Log everything

---

## 15. Future Extensions (v2)

* user suspensions
* chat restrictions
* shadow moderation
* trust scoring
* AI-assisted moderation (Mini-G)
* appeals system

---

## Final Principle

Moderation should make Nite's Watch feel:

* safe, not sterile
* human, not robotic
* protected, not controlled

---
