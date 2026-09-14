import { describe, expect, test } from "bun:test";
import { parseBuddyReply } from "../src/shared/pointer";

describe("parseBuddyReply", () => {
  test("reads structured JSON", () => {
    const reply = parseBuddyReply(
      JSON.stringify({
        speech: "The save button is here.",
        point: { x: 0.2, y: 0.8, label: "Save" },
      }),
    );
    expect(reply.speech).toBe("The save button is here.");
    expect(reply.point).toEqual({ x: 0.2, y: 0.8, label: "Save" });
  });

  test("clamps coordinates and accepts POINT tags", () => {
    const reply = parseBuddyReply(
      'Click near the dialog. <POINT x="1.4" y="-0.2" label="Close" />',
    );
    expect(reply.speech).toBe("Click near the dialog.");
    expect(reply.point).toEqual({ x: 1, y: 0, label: "Close" });
  });

  test("extracts JSON from fenced markdown", () => {
    const reply = parseBuddyReply(`Here you go
\`\`\`json
{"speech":"Done","point":null}
\`\`\``);
    expect(reply.speech).toBe("Done");
    expect(reply.point).toBeNull();
  });
});
