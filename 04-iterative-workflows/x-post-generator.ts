/*
  Iterative Content Generation Workflow

  Goal:
    - Generate a post (blog, article, etc.)
    - Evaluate it for quality
    - Improve iteratively until approved

  Workflow Steps:

  1. START
     - Workflow begins with an initial topic or prompt
     - Example: "Write a blog post about the benefits of AI in education"

  2. Generate Post
     - The system/LLM generates an initial draft of the post
     - Output: raw generated content

  3. Evaluate Post
     - Evaluate the generated post for quality
       • Clarity and readability
       • Grammar and spelling
       • Relevance to the topic
       • Depth and completeness
     - Output: evaluation result (approved / needs_improvement)

  4. Conditional Branching
     - If evaluation is "approved":
         → End workflow
         → Return final post
     - If evaluation is "needs_improvement":
         → Use feedback to optimize or rewrite the post
         → Send the improved post back to the evaluation step
         → Repeat loop until post is approved

  Notes:
    - This is an iterative or feedback loop workflow
    - It allows the system to refine content automatically
    - Ensures quality before final output
    - Can be extended with multiple evaluation criteria or scoring thresholds
*/

import { START, END, StateGraph } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import dotenv from "dotenv";
dotenv.config();

const PostAnnotation = Annotation.Root({
  topic: Annotation<string>,
  tweet: Annotation<string>, // generated tweet
  evaluation: Annotation<"approved" | "needs_improvement">,
  feedback: Annotation<string>,
  iteration: Annotation<number>,
  max_iteration: Annotation<number>,

  tweet_history: Annotation<string[]>,
  feedback_history: Annotation<string[]>,
});

type PostState = typeof PostAnnotation.State;

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

async function generatePost(state: PostState): Promise<Partial<PostState>> {
  const { topic, iteration, tweet_history } = state;
  const prompt = `
    Write a single, clever, and engaging tweet about the topic: "${topic}".
    Make it witty, insightful, and thought-provoking, while keeping it under 280 characters.
    The tweet should capture attention and feel intelligent and shareable.

    Rules:
    - This is version ${iteration + 1}
    - Keep it under 280 characters
    - Make it witty, clever, and intelligent
    - Use a friendly and engaging tone
    - Avoid hashtags and emojis
    - Focus on key insights of the topic
    `;

  const response = await callBedrockLLM(prompt);
  console.log("generatePost response: ", response);
  return {
    tweet: response,
    tweet_history: [...(tweet_history || []), response],
  };
}

async function evaluatePost(state: PostState): Promise<Partial<PostState>> {
  const { tweet, feedback_history } = state;

  const prompt = `
    You are a ruthless, no-nonsense Twitter critic. Evaluate tweets based on the following criteria:

    1. Originality – Is it fresh, or overused?  
    2. Humor – Does it genuinely make someone smile, laugh, or chuckle?  
    3. Punchiness – Is it short, sharp, and scroll-stopping?  
    4. Virality Potential – Would people retweet or share it?  
    5. Format – Well-formed tweet, under 280 characters, not a setup-punchline or Q&A joke.

    Auto-reject if:
    - Written in Q&A format (e.g., "Why did..." or "What happens when...")
    - Exceeds 280 characters
    - Reads like a traditional setup-punchline joke
    - Ends with generic, throwaway, or weak lines that dilute humor

    Evaluate the following tweet:

    Tweet: """${tweet}"""

    Respond STRICTLY in JSON format:
    {
        "evaluation": "approved" | "needs_improvement",
        "feedback": "One paragraph explaining strengths and weaknesses"
    }
    `;

  const response = await callBedrockLLM(prompt);
  console.log("evaluatePost response: ", response);
  let parsed;
  try {
    parsed = JSON.parse(response);
  } catch (error) {
    console.error("Failed to parse LLM response:", error);
    throw new Error("Invalid JSON format returned by LLM");
  }
  return {
    evaluation: parsed.evaluation,
    feedback: parsed.feedback,
    feedback_history: [...(feedback_history || []), parsed.feedback],
  };
}

async function optimizePost(state: PostState): Promise<Partial<PostState>> {
  const { tweet, feedback, topic, iteration, tweet_history } = state;

  const prompt = `
    You are a Twitter content expert. Your goal is to punch up tweets for maximum virality, humor, and engagement based on given feedback.

    Improve the tweet using the feedback provided:

    Feedback: """${feedback}"""
    Topic: "${topic}"
    Original Tweet: """${tweet}"""

    Instructions:
    - Re-write it as a short, catchy, viral-worthy tweet.
    - Avoid Q&A or setup-punchline formats.
    - Keep it under 280 characters.
    - Make it witty, engaging, and attention-grabbing.

    Respond ONLY with the improved tweet as plain text.
    `;

  const response = await callBedrockLLM(prompt);
  console.log("optimizePost response: ", response);
  let updatedIteration = iteration + 1;

  return {
    iteration: updatedIteration,
    tweet_history: [...(tweet_history || []), response],
    tweet: response,
  };
}

function checkEvalutionCondition(
  state: PostState
): "approved" | "needs_improvement" {
  const { iteration, evaluation, max_iteration } = state;
  if (iteration > max_iteration || evaluation === "approved") return "approved";
  else return "needs_improvement";
}

const workflow = new StateGraph(PostAnnotation)
  .addNode("generate_post", generatePost)
  .addNode("evaluate_post", evaluatePost)
  .addNode("optimize_post", optimizePost)

  .addEdge(START, "generate_post")
  .addEdge("generate_post", "evaluate_post")
  .addConditionalEdges("evaluate_post", checkEvalutionCondition, {
    approved: END,
    needs_improvement: "optimize_post",
  })
  .addEdge("evaluate_post", "optimize_post")
  .compile();

async function runWorkflow() {
  const initialState = {
    topic: "How AI is quietly reshaping our daily lives",
    iteration: 1,
    max_iteration: 5,
  };
  const finalOutput = await workflow.invoke(initialState);
  console.log(finalOutput);
}

runWorkflow();
