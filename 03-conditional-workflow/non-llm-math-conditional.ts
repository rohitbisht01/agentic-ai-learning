// workflow that solves quadratic equations
// ax2+bx+c = 0, there are two roots, calculate discriminant => b2 - 4ac
// based on discriminant there are three possible conditions:
// d > 0, then we have two real root, -b+squareroot of d / 2a, -b-squareroot of d / 2a,
// d = 0, then we have one repeated root, -b/2a
// d < 0, no real root

/*
start => we have a,b,c values
show equation => ax2+bx+c 
calculate discriminant => b2-4ac
based on discriment we have three conditions
end
*/

import { START, END, StateGraph, Annotation } from "@langchain/langgraph";
import fs from "fs";

const EquationAnnotation = Annotation.Root({
  a: Annotation<number>,
  b: Annotation<number>,
  c: Annotation<number>,
  equation: Annotation<string>,
  discriminant: Annotation<number>, // float
  result: Annotation<string>,
});

type EquationState = typeof EquationAnnotation.State;

async function drawWorkflowDiagram() {
  const representation = workflow.getGraph();
  const image = await representation.drawMermaidPng();
  const buffer = Buffer.from(await image.arrayBuffer());
  fs.writeFileSync("workflow.png", buffer);
  console.log("Workflow diagram saved as workflow.png");
}

function formatQuadratic(a: number, b: number, c: number) {
  const bSign = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
  const cSign = c >= 0 ? `+ ${c}` : `- ${Math.abs(c)}`;
  return `${a}x² ${bSign}x ${cSign} = 0`;
}

function showEquation(state: EquationState) {
  const { a, b, c } = state;
  const equation = formatQuadratic(a, b, c);
  return { equation };
}

function calculateDiscriminent(state: EquationState) {
  const { a, b, c } = state;
  const discriminant = b * b - 4 * a * c;
  return { discriminant };
}

function findRealRoots(state: EquationState) {
  const { a, b, discriminant } = state;
  const root1 = (-b + Math.sqrt(discriminant)) / (2 * a);
  const root2 = (-b - Math.sqrt(discriminant)) / (2 * a);
  const roots = `Two distinct real roots: x₁ = ${root1.toFixed(
    2
  )}, x₂ = ${root2.toFixed(2)}`;
  return { result: roots };
}

function findRepeatedRoots(state: EquationState) {
  const { a, b } = state;
  const root = -b / (2 * a);
  const roots = `One repeated real root: x = ${root.toFixed(2)}`;
  return { result: roots };
}

function findNoRealRoots(state: EquationState) {
  const { a, b, discriminant } = state;
  const realPart = (-b / (2 * a)).toFixed(2);
  const imagPart = (Math.sqrt(-discriminant) / (2 * a)).toFixed(2);
  const roots = `No real roots. Complex roots: x₁ = ${realPart} + ${imagPart}i, x₂ = ${realPart} - ${imagPart}i`;
  return { result: roots };
}

function checkDiscriminantCondition(
  state: EquationState
): "real_roots" | "no_real_roots" | "repeated_roots" {
  if (state.discriminant === 0) return "repeated_roots";
  else if (state.discriminant < 0) return "no_real_roots";
  else return "real_roots";
}

const workflow = new StateGraph(EquationAnnotation)
  .addNode("show_equation", showEquation)
  .addNode("calculate_discriminant", calculateDiscriminent)
  .addNode("real_roots", findRealRoots)
  .addNode("repeated_roots", findRepeatedRoots)
  .addNode("no_real_roots", findNoRealRoots)
  .addEdge(START, "show_equation")
  .addEdge("show_equation", "calculate_discriminant")
  .addConditionalEdges("calculate_discriminant", checkDiscriminantCondition)
  //   .addConditionalEdges("calculate_discriminant", (state: EquationState) => {
  //     if (state.discriminant === 0) return "repeated_roots";
  //     else if (state.discriminant < 0) return "no_real_roots";
  //     else return "real_roots";
  //   })
  .addEdge("real_roots", END)
  .addEdge("no_real_roots", END)
  .addEdge("repeated_roots", END)
  .compile();

async function runWorkflow() {
  //   const initialState = { a: 1, b: -3, c: 2 };
  const initialState = { a: 4, b: -5, c: -4 };
  const finalState = await workflow.invoke(initialState);
  console.log(finalState);
}

// drawWorkflowDiagram();
runWorkflow();
