import { StateGraph, START, END, Annotation } from "@langchain/langgraph";

type BMICategory =
  | "Underweight"
  | "Normal weight"
  | "Overweight"
  | "Obese (Class I)"
  | "Obese (Class II)"
  | "Obese (Class III)";

// Define state using Annotation
const BMIStateAnnotation = Annotation.Root({
  weight_kg: Annotation<number>,
  height_m: Annotation<number>,
  bmi: Annotation<number>,
  category: Annotation<BMICategory>,
});

type BMIState = typeof BMIStateAnnotation.State;

// Return only the fields you want to update
async function calculateBMI(state: BMIState): Promise<Partial<BMIState>> {
  const { weight_kg, height_m } = state;
  const bmi = weight_kg / (height_m * height_m);
  return {
    bmi: Math.round(bmi * 100) / 100,
  };
}

async function labelBMI(state: BMIState): Promise<Partial<BMIState>> {
  const { bmi } = state;
  let category: BMICategory;

  if (bmi < 18.5) {
    category = "Underweight";
  } else if (bmi < 25) {
    category = "Normal weight";
  } else if (bmi < 30) {
    category = "Overweight";
  } else if (bmi < 35) {
    category = "Obese (Class I)";
  } else if (bmi < 40) {
    category = "Obese (Class II)";
  } else {
    category = "Obese (Class III)";
  }

  return {
    category,
  };
}

// create and build the graph
const workflow = new StateGraph(BMIStateAnnotation)
  .addNode("calculate_bmi", calculateBMI)
  .addNode("label_bmi", labelBMI)
  .addEdge(START, "calculate_bmi")
  .addEdge("calculate_bmi", "label_bmi")
  .addEdge("label_bmi", END)
  .compile();

// execute the workflow
async function runWorkflow() {
  const initialState = {
    weight_kg: 90,
    height_m: 1.83,
  };
  const finalState = await workflow.invoke(initialState);
  console.log(finalState);
}

runWorkflow();
