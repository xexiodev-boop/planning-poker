// Suggestion algorithms with their display copy. Shared so the worker's allowed
// set and the client's settings picker are generated from one list — the ids
// here are the source of truth the server validates against.
export const SUGGESTION_ALGORITHMS = [
  {
    id: "most_votes",
    name: "Most votes",
    description: "Pick the most popular card; ties lean higher.",
  },
  {
    id: "middle_ground",
    name: "Middle ground",
    description: "For tied leaders, choose the card nearest their midpoint.",
  },
  {
    id: "median",
    name: "Median",
    description: "Pick the middle submitted card, reducing the effect of extremes.",
  },
  {
    id: "average_up",
    name: "Average, rounded up",
    description: "Average numeric votes and round up to a card in the deck.",
  },
  {
    id: "highest",
    name: "Highest vote",
    description: "Use the most cautious submitted estimate.",
  },
  {
    id: "none",
    name: "No suggestion",
    description: "Show the votes and leave the decision entirely to the team.",
  },
];

export const SUGGESTION_ALGORITHM_IDS = SUGGESTION_ALGORITHMS.map(({ id }) => id);
