import { describe, expect, it } from "vitest";
import { ROOM_LIMITS } from "../shared/limits.js";
import { csvCell } from "../src/lib/export.js";
import {
  calculateResultMetrics,
  calculateSuggestion,
  cleanCards,
  readJson,
} from "../worker/room-logic.js";
import { PlanningRoom } from "../worker/index.js";

const deck = { cards: ["1", "2", "3", "5", "8", "13", "?", "☕"] };

function roundWith(values) {
  return {
    votes: Object.fromEntries(values.map((value, index) => [
      `person-${index}`,
      { value, confirmed: true },
    ])),
  };
}

describe("suggestion algorithms", () => {
  it("uses the higher card for tied most-vote results", () => {
    expect(calculateSuggestion(roundWith(["2", "5"]), deck, "most_votes")).toMatchObject({
      value: "5",
      tied: true,
    });
  });

  it("finds the deck midpoint for middle ground", () => {
    expect(calculateSuggestion(roundWith(["1", "13"]), deck, "middle_ground")).toMatchObject({
      value: "5",
      tied: true,
    });
  });

  it("calculates median, rounded average, highest, and no suggestion", () => {
    const round = roundWith(["1", "3", "13"]);
    expect(calculateSuggestion(round, deck, "median").value).toBe("3");
    expect(calculateSuggestion(round, deck, "average_up").value).toBe("8");
    expect(calculateSuggestion(round, deck, "highest").value).toBe("13");
    expect(calculateSuggestion(round, deck, "none")).toBeNull();
  });
});

describe("result metrics", () => {
  it("calculates consensus and deck spread", () => {
    expect(calculateResultMetrics(roundWith(["2", "2", "8"]), deck)).toEqual({
      voteCount: 3,
      consensusPercent: 67,
      unanimous: false,
      low: "2",
      high: "8",
      spread: 3,
    });
  });
});

describe("input safety", () => {
  it("enforces the shared card limit", () => {
    expect(() => cleanCards(Array.from({ length: ROOM_LIMITS.cards + 1 }, (_, index) => index)))
      .toThrow(/at most 16 cards/);
  });

  it("stops reading request bodies after the byte limit", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(ROOM_LIMITS.requestBytes) }),
    });
    await expect(readJson(request)).rejects.toThrow("Request is too large.");
  });

  it("neutralizes spreadsheet formulas in CSV cells", () => {
    expect(csvCell('=HYPERLINK("https://example.test")'))
      .toBe('"\'=HYPERLINK(""https://example.test"")"');
  });
});

describe("authorization", () => {
  it("rejects facilitator actions from regular participants", async () => {
    const object = new PlanningRoom({});
    const participant = { id: "p1", role: "participant" };
    const room = {
      deck,
      settings: { revealDelaySeconds: 30 },
      currentRound: null,
    };

    await expect(object.applyAction(room, participant, { type: "start_round", title: "Nope" }))
      .rejects.toThrow("Only the facilitator can start a round.");
    await expect(object.applyAction(room, participant, { type: "set_room_lock", locked: true }))
      .rejects.toThrow("Only the facilitator can lock the room.");
  });
});
