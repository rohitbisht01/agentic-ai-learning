/*
  Sentiment Response Workflow

  Goal:
    - Take user sentiment input ("positive" or "negative")
    - Respond appropriately using an LLM

  Workflow Steps:

  1. START

  2. Find Sentiment
     - Run user input through an LLM or sentiment analyzer
     - Determine if sentiment is "positive" or "negative"

  3. Conditional Branching
     - If sentiment is positive:
         → Ask LLM to generate a positive response
         → END

     - If sentiment is negative:
         → Run a diagnosis step (via LLM) to identify:
             • issue_type
             • tone
             • urgency
         → Feed the diagnosis results into another LLM call
           to generate an appropriate negative response
         → END
*/

//  parse the data that is being returned from callLLM function again cause it only parses the
//  outer reponse, but within content[0].text if u have specified it be be json => then parse it again
// in case the reponse is just text, then no need to parse

import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const SentimentAnnotation = Annotation.Root({
  user_review: Annotation<string>,
  sentiment: Annotation<"positive" | "negative">,
  issue_type: Annotation<"UX" | "Performance" | "Bug" | "Support" | "Other">,
  tone: Annotation<"angry" | "frustrated" | "disappointed" | "calm">,
  urgency: Annotation<"low" | "medium" | "high">,
  response: Annotation<string>,
});

type SentimentState = typeof SentimentAnnotation.State;

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

async function reviewSentiment(
  state: SentimentState
): Promise<Partial<SentimentState>> {
  const { user_review } = state;
  const prompt = `You are a Customer Success Manager reviewing customer feedback.

    Analyze the following user review and determine whether the sentiment is **positive** or **negative**.

    User review: """${user_review}"""

    Respond strictly in JSON format:
    {
      "sentiment": "positive" | "negative",
    }
    `;

  const response = await callBedrockLLM(prompt);
  let parsed;
  try {
    parsed = JSON.parse(response);
  } catch (err) {
    console.error("Failed to parse LLM response:", err);
    throw new Error("Invalid JSON format returned by LLM");
  }

  return {
    sentiment: parsed.sentiment,
  };
}

async function runDiagnosis(
  state: SentimentState
): Promise<Partial<SentimentState>> {
  const { user_review } = state;
  const responseSchema = `
  {
    "issue_type":"UX" | "Performance" | "Bug" | "Support" | "Other" - The category of issue mentioned in the review ,
    "tone": "angry" | "frustrated" | "disappointed" | "calm" - The emotional tone expressed by the user,
    "urgency": "low" | "medium" | "high" - How urgent or critical the issue appears to be,
  }
  `;
  const prompt = `Diagnose this negative review and return three things issue_type, urgency and tone
  User review: """${user_review}"""

  Return your output **only** as a JSON object strictly following this schema:
    ${responseSchema}
  `;

  const response = await callBedrockLLM(prompt);
  let parsed;
  try {
    parsed = JSON.parse(response);
  } catch (error) {
    console.error("Failed to parse LLM response:", error);
    throw new Error("Invalid JSON format returned by LLM");
  }
  return {
    urgency: parsed.urgency,
    issue_type: parsed.issue_type,
    tone: parsed.tone,
  };
}

async function generateNegativeResponse(
  state: SentimentState
): Promise<Partial<SentimentState>> {
  const { user_review, issue_type, sentiment, tone, urgency } = state;
  const prompt = `
    You are a helpful and empathetic customer support assistant.

    The user reported an issue of type: ${issue_type}.
    Their tone sounded: ${tone}.
    The urgency level is: ${urgency}.

    Write a professional, empathetic, and reassuring message that:
    - Acknowledges the user's concern,
    - Expresses understanding,
    - Offers a brief, helpful resolution or next step.

    Keep the tone polite and human — no robotic phrasing.
  `;
  const response = await callBedrockLLM(prompt);

  return {
    response: response,
  };
}

async function generatePositiveResponse(
  state: SentimentState
): Promise<Partial<SentimentState>> {
  const { user_review, issue_type, sentiment, tone, urgency } = state;
  const prompt = `
    You are a friendly and professional customer success manager.

    The user has left a positive review. Here is the review:
    """${user_review}"""

    Write a warm, engaging, and personalized response that:
    - Thanks the user for their feedback,
    - Acknowledges what they liked,
    - Encourages continued engagement with the product/service.

    Keep the tone upbeat, genuine, and concise.
    Respond strictly as plain text.
    `;

  const response = await callBedrockLLM(prompt);

  return {
    response: response,
  };
}

function checkCondition(
  state: SentimentState
): "run_diagnosis" | "positive_response" {
  const { sentiment } = state;
  if (sentiment === "positive") return "positive_response";
  else return "run_diagnosis";
}

const workflow = new StateGraph(SentimentAnnotation)
  .addNode("review_sentiment", reviewSentiment)
  .addNode("run_diagnosis", runDiagnosis)
  .addNode("negative_response", generateNegativeResponse)
  .addNode("positive_response", generatePositiveResponse)
  .addEdge(START, "review_sentiment")
  .addConditionalEdges("review_sentiment", checkCondition)
  .addEdge("run_diagnosis", "negative_response")
  .addEdge("negative_response", END)
  .addEdge("positive_response", END)
  .compile();

const testReviews = [
  // Positive
  "I absolutely love this product! It exceeded all my expectations.",
  "The service was amazing and the staff were very helpful.",

  // Negative
  "I'm really disappointed. The item arrived broken and customer support was unhelpful.",
  "The app keeps crashing and it’s been very frustrating to use.",
];

async function runWorkflow() {
  const initialState = {
    user_review: testReviews[2],
  };

  const finalState = await workflow.invoke(initialState);
  console.log(finalState);
}

runWorkflow();
