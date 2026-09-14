---
name: buddy-repo-loop
description: >-
  Works the Buddy Electron Windows overlay from known notch, HWND, mic, and
  talk-pipeline constraints instead of re-researching them. Use when editing
  this repo, the notch, Settings, mic, click-through windows, or listen/talk
  flow; also when a session teaches a cheaper path and this skill should be
  updated.
---

# Buddy repo loop

Start from constraints already paid for. The live Electron window is the pass/fail signal.

## First 60 seconds

1. Read the user symptom against the notch: **Close** means Settings is expanded; idle copy + purple mic means listen never started; a clipped bar under Close is a bounds bug.
2. Open only [files.md](files.md). Stop if those files explain the symptom.
3. Patch. Unit-test geometry in `tests/input.test.ts`. Verify in the running Electron app when the change is UI or process lifetime.

Done when the mapped files either contain the fix or name the next file.

## Research budget

Symptom → those files → last related commit. Electron docs only when a file you already opened names an API.

## After the patch

If this session taught a cheaper path, append one bullet to [gotchas.md](gotchas.md).

## Additional resources

- File map: [files.md](files.md)
- Session constraints: [gotchas.md](gotchas.md)
