/*
  Parallel Workflow Implementation: UPSC Essay Evaluation

  Input:
    - Essay text (raw written content)

  Independent Evaluation Nodes (run in parallel using LLM):
    1. Clarity of Thought
       - Analyze logical flow, structure, coherence
       - Output: feedback text + score (0–10)

    2. Depth of Analysis
       - Evaluate critical thinking, examples, multi-dimensional arguments
       - Output: feedback text + score (0–10)

    3. Language & Expression
       - Assess vocabulary, grammar, style, readability
       - Output: feedback text + score (0–10)

  Aggregation Node:
    - Collects outputs from all three evaluations
    - Merges individual feedback into summarized feedback
    - Computes final score (e.g., average or weighted across 3 scores)
    - Returns final evaluation report

  Workflow:
    START
      ├── Node 1 → Evaluate Clarity
      ├── Node 2 → Evaluate Depth of Analysis
      └── Node 3 → Evaluate Language & Expression
    MERGE (aggregate results)
    → Final Evaluation Node (summarized feedback + overall score)
    END
*/

/*
here are couple of things i am expecting from llm like in a structured format like the text feedback and the score (1-10) => this is where structured output concept comes in picture, using reducer function 

parallel workflow , structured output, reducer function implementation

structured output => build a schema that we want from llm
*/

/*
  Parallel Workflow Implementation: UPSC Essay Evaluation
  Fixed with proper reducer function for parallel state updates
*/

import { START, END, StateGraph, Annotation } from "@langchain/langgraph";
import { z } from "zod";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

// Define state with reducer function for parallel updates
const UpseState = Annotation.Root({
  essay: Annotation<string>,
  language_feedback: Annotation<string>,
  analysis_feedback: Annotation<string>,
  clarity_feedback: Annotation<string>,
  overall_feedback: Annotation<string>,
  // CRITICAL: Use reducer to merge parallel score updates
  individual_scores: Annotation<number[]>({
    reducer: (current: number[], update: number[]) => {
      return [...(current || []), ...(update || [])];
    },
    default: () => [],
  }),
  average_score: Annotation<number>,
});

const EvaluationSchema = z.object({
  feedback: z.string().describe("Detailed feedback for the essay"),
  score: z.number().min(0).max(10).describe("Score out of 10"),
});

const REGION = process.env.REGION || "ap-south-1";
const MODEL_ID = process.env.MODEL_ID || "default-model-id";

async function callBedrockLLM(prompt: string): Promise<any> {
  const bedrockClient = new BedrockRuntimeClient({
    region: REGION,
  });
  const messages = [
    {
      role: "user",
      content: prompt,
    },
  ];
  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    accept: "application/json",
    body: JSON.stringify({
      messages,
      anthropic_version: "bedrock-2023-05-31",
      temperature: 0.1,
      max_tokens: 4000,
    }),
  });
  const response = await bedrockClient.send(command);
  const output = JSON.parse(new TextDecoder().decode(response.body));

  return output?.content[0]?.text;
}

async function evaluateClarity(state: typeof UpseState.State) {
  const schemaForPrompt = `
  {
    "feedback": "string - Detailed feedback for the essay",
    "score": "number - Score out of 10"
  }`;

  const prompt = `
    You are an expert UPSC essay evaluator.
    Your task is to analyze the clarity of thought of the essay below.

    Return your output **only** as a JSON object strictly following this schema:
    ${schemaForPrompt}

    Guidelines:
    - Be specific and concise in feedback.
    - Assign a score out of 10.
    - Ensure valid JSON.

    Essay:
    """
    ${state.essay}
    """
    `;

  const response = await callBedrockLLM(prompt);

  try {
    const parsed = EvaluationSchema.parse(JSON.parse(response));
    return {
      clarity_feedback: parsed.feedback,
      individual_scores: [parsed.score], // Return as array for reducer
    };
  } catch (err) {
    console.error("JSON parsing or validation failed in evaluateClarity", err);
    console.error("Model output:", response);
    throw err;
  }
}

async function depthAnalysis(state: typeof UpseState.State) {
  const schemaForPrompt = `
  {
    "feedback": "string - Detailed feedback evaluating the essay's depth of analysis, reasoning, and examples",
    "score": "number - Score out of 10 for depth of analysis"
  }`;

  const prompt = `
    You are an expert UPSC essay evaluator specializing in analytical depth and critical reasoning.

    Your task is to evaluate the *Depth of Analysis* in the essay below.

    Return your output **only** as a JSON object strictly following this schema:
    ${schemaForPrompt}

    Guidelines:
    - Assess how deeply the essay explores the topic — does it go beyond surface-level statements?
    - Check whether arguments are supported by logic, data, or real-world examples.
    - Evaluate multi-dimensional thinking: social, economic, political, ethical, and global perspectives.
    - Identify any superficial reasoning or lack of counter-arguments.
    - Provide constructive, specific feedback — avoid generic praise.
    - Assign a **score between 0 and 10**, where:
      - 0–3 → Poor analytical depth
      - 4–6 → Moderate analysis but lacks depth or evidence
      - 7–8 → Good analysis with some critical insight
      - 9–10 → Excellent analytical depth with strong reasoning and multidimensional arguments
    - Ensure your output is **valid JSON** only — no extra text.

    Essay:
    """
    ${state.essay}
    """
    `;

  const response = await callBedrockLLM(prompt);

  try {
    const parsed = EvaluationSchema.parse(JSON.parse(response));
    return {
      analysis_feedback: parsed.feedback,
      individual_scores: [parsed.score],
    };
  } catch (err) {
    console.error("JSON parsing or validation failed in depthAnalysis", err);
    console.error("Model output:", response);
    throw err;
  }
}

async function languageAnalysis(state: typeof UpseState.State) {
  const schemaForPrompt = `
  {
    "feedback": "string - Detailed feedback assessing the essay's language, vocabulary, grammar, tone, and readability",
    "score": "number - Score out of 10 for language and expression quality"
  }`;

  const prompt = `
    You are an expert UPSC essay evaluator specializing in *Language and Expression*.

    Your task is to evaluate how effectively the essay communicates ideas through language.

    Return your output **only** as a JSON object strictly following this schema:
    ${schemaForPrompt}

    Guidelines:
    - Assess vocabulary richness, grammar accuracy, and sentence flow.
    - Evaluate tone and style — is it formal, academic, and appropriate for UPSC standards?
    - Judge readability and conciseness — does the essay maintain clarity without redundancy?
    - Identify issues like repetition, awkward phrasing, or inconsistent tone.
    - Provide constructive, actionable feedback focused on writing quality.
    - Assign a **score between 0 and 10**, where:
      - 0–3 → Poor grammar, limited vocabulary, weak flow
      - 4–6 → Adequate expression but inconsistent or verbose
      - 7–8 → Good clarity, vocabulary, and structure with minor issues
      - 9–10 → Excellent command of language, precise and elegant expression
    - Respond **only with valid JSON** — no extra commentary or text.

    Essay:
    """
    ${state.essay}
    """
    `;

  const response = await callBedrockLLM(prompt);

  try {
    const parsed = EvaluationSchema.parse(JSON.parse(response));
    return {
      language_feedback: parsed.feedback,
      individual_scores: [parsed.score],
    };
  } catch (err) {
    console.error("JSON parsing or validation failed in languageAnalysis", err);
    console.error("Model output:", response);
    throw err;
  }
}

async function aggregateAnalysis(state: typeof UpseState.State) {
  const scores = state.individual_scores || [];
  const average = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;

  const prompt = `
    You are a UPSC essay evaluator.
    Combine the following feedback into a concise summary (3-4 sentences):

    Clarity Feedback: ${state.clarity_feedback}
    Depth Feedback: ${state.analysis_feedback}
    Language Feedback: ${state.language_feedback}
    `;

  const response = await callBedrockLLM(prompt);
  return {
    overall_feedback: response,
    average_score: parseFloat(average.toFixed(2)),
  };
}

const workflow = new StateGraph(UpseState)
  .addNode("evaluate_clarity", evaluateClarity)
  .addNode("depth_analysis", depthAnalysis)
  .addNode("language_analysis", languageAnalysis)
  .addNode("aggregate_analysis", aggregateAnalysis)
  .addEdge(START, "evaluate_clarity")
  .addEdge(START, "depth_analysis")
  .addEdge(START, "language_analysis")
  .addEdge("evaluate_clarity", "aggregate_analysis")
  .addEdge("depth_analysis", "aggregate_analysis")
  .addEdge("language_analysis", "aggregate_analysis")
  .addEdge("aggregate_analysis", END)
  .compile();

async function runWorkflow() {
  const initialState = {
    essay: `India in the Age of AI
    As the world enters a transformative era defined by artificial intelligence (AI), India stands at a critical juncture — one where it can either emerge as a global leader in AI innovation or risk falling behind in the technology race. The age of AI brings with it immense promise as well as unprecedented challenges, and how India navigates this landscape will shape its socio-economic and geopolitical future.

    India's strengths in the AI domain are rooted in its vast pool of skilled engineers, a thriving IT industry, and a growing startup ecosystem. With over 5 million STEM graduates annually and a burgeoning base of AI researchers, India possesses the intellectual capital required to build cutting-edge AI systems. Institutions like IITs, IIITs, and IISc have begun fostering AI research, while private players such as TCS, Infosys, and Wipro are integrating AI into their global services. In 2020, the government launched the National AI Strategy (AI for All) with a focus on inclusive growth, aiming to leverage AI in healthcare, agriculture, education, and smart mobility.

    One of the most promising applications of AI in India lies in agriculture, where predictive analytics can guide farmers on optimal sowing times, weather forecasts, and pest control. In healthcare, AI-powered diagnostics can help address India's doctor-patient ratio crisis, particularly in rural areas. Educational platforms are increasingly using AI to personalize learning paths, while smart governance tools are helping improve public service delivery and fraud detection.

    However, the path to AI-led growth is riddled with challenges. Chief among them is the digital divide. While metropolitan cities may embrace AI-driven solutions, rural India continues to struggle with basic internet access and digital literacy. The risk of job displacement due to automation also looms large, especially for low-skilled workers. Without effective skilling and re-skilling programs, AI could exacerbate existing socio-economic inequalities.

    Another pressing concern is data privacy and ethics. As AI systems rely heavily on vast datasets, ensuring that personal data is used transparently and responsibly becomes vital. India is still shaping its data protection laws, and in the absence of a strong regulatory framework, AI systems may risk misuse or bias.

    To harness AI responsibly, India must adopt a multi-stakeholder approach involving the government, academia, industry, and civil society. Policies should promote open datasets, encourage responsible innovation, and ensure ethical AI practices. There is also a need for international collaboration, particularly with countries leading in AI research, to gain strategic advantage and ensure interoperability in global systems.

    India's demographic dividend, when paired with responsible AI adoption, can unlock massive economic growth, improve governance, and uplift marginalized communities. But this vision will only materialize if AI is seen not merely as a tool for automation, but as an enabler of human-centered development.

    In conclusion, India in the age of AI is a story in the making — one of opportunity, responsibility, and transformation. The decisions we make today will not just determine India's AI trajectory, but also its future as an inclusive, equitable, and innovation-driven society.`,
  };

  const outputState = await workflow.invoke(initialState);
  console.log(outputState);
}

runWorkflow();
