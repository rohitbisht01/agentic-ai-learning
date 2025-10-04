/*
  Cricket App - Batting Stats Workflow

  Input:
    - runsScored       (total runs by batsman)
    - ballsPlayed      (total balls faced)
    - foursHit         (number of 4s hit)
    - sixesHit         (number of 6s hit)

  Outputs to Calculate (independent tasks, can run in parallel):
    1. Strike Rate
       → (runsScored / ballsPlayed) * 100

    2. Runs in Boundary Percentage
       → ((foursHit*4 + sixesHit*6) / runsScored) * 100

    3. Balls per Boundary
       → ballsPlayed / (foursHit + sixesHit)

  Workflow:
    START
      ├── Node 1 → Calculate Strike Rate
      ├── Node 2 → Calculate Boundary Percentage
      └── Node 3 → Calculate Balls per Boundary
    MERGE (collect results from all three nodes)
    → Generate summary
    END
*/

// here you will see we are not sending whole state as a result from each node, as it can't
// comprehend which state to update, this issue will only come in parallel execution not in
// serial execution workflows, so that why only return those values which are getting updated.

import { START, END, StateGraph } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";

const CricketAnnotation = Annotation.Root({
  runsScored: Annotation<number>,
  ballsPlayed: Annotation<number>,
  foursHit: Annotation<number>,
  sixesHit: Annotation<number>,

  strikeRate: Annotation<number>,
  boundaryPercentage: Annotation<number>,
  ballsPerBoundary: Annotation<number>,
});

type CricketState = typeof CricketAnnotation.State;

async function calculateStrikeRate(state: CricketState) {
  const { runsScored, ballsPlayed } = state;
  if (ballsPlayed === 0) return { strikeRate: 0 };

  const strikeRate = (runsScored / ballsPlayed) * 100;
  return { strikeRate: Math.round(strikeRate) };
}

async function calculateBoundaryPercentage(state: CricketState) {
  const { foursHit, sixesHit, runsScored } = state;
  if (runsScored === 0) return { boundaryPercentage: 0 };

  const boundaryRuns = foursHit * 4 + sixesHit * 6;
  const boundaryPercentage = (boundaryRuns / runsScored) * 100;
  return { boundaryPercentage: Math.round(boundaryPercentage) };
}

async function calculateBallsPerBoundary(state: CricketState) {
  const { ballsPlayed, foursHit, sixesHit } = state;
  const totalBoundaries = foursHit + sixesHit;
  if (totalBoundaries === 0) return { ballsPerBoundary: ballsPlayed }; // no boundaries hit

  const ballsPerBoundary = ballsPlayed / totalBoundaries;
  return { ballsPerBoundary: Math.round(ballsPerBoundary) };
}

async function generateSummary(state: CricketState) {
  const {
    runsScored,
    ballsPlayed,
    foursHit,
    sixesHit,
    strikeRate,
    ballsPerBoundary,
    boundaryPercentage,
  } = state;

  const summary = `
    Batting Summary:
    - Runs Scored: ${runsScored}
    - Balls Faced: ${ballsPlayed}
    - Fours: ${foursHit}, Sixes: ${sixesHit}
    - Strike Rate: ${strikeRate}
    - Boundary Percentage: ${boundaryPercentage}%
    - Balls per Boundary: ${ballsPerBoundary}
  `.trim();

  return { summary };
}

const workflow = new StateGraph(CricketAnnotation)
  .addNode("calculate_strike_rate", calculateStrikeRate)
  .addNode("calculate_boundary_percentage", calculateBoundaryPercentage)
  .addNode("calculate_balls_per_boundary", calculateBallsPerBoundary)
  .addNode("generate_summary", generateSummary)
  .addEdge(START, "calculate_strike_rate")
  .addEdge(START, "calculate_boundary_percentage")
  .addEdge(START, "calculate_balls_per_boundary")
  .addEdge("calculate_strike_rate", "generate_summary")
  .addEdge("calculate_boundary_percentage", "generate_summary")
  .addEdge("calculate_balls_per_boundary", "generate_summary")
  .addEdge("calculate_balls_per_boundary", END)
  .compile();

async function runWorkflow() {
  const initialState = {
    runsScored: 50,
    ballsPlayed: 20,
    foursHit: 5,
    sixesHit: 3,
  };
  const finalOutput = await workflow.invoke(initialState);
  console.log(finalOutput);
}

runWorkflow();
