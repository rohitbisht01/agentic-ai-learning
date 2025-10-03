// basic idea is to ask question to llm and get answer from it and store it in a state using langgraph and langchain
// START => ask question node => get answer node => end

import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const QuestionAnswerAnnotation = Annotation.Root({
  question: Annotation<string>,
  answer: Annotation<string>,
});

type QuestionAnswerState = typeof QuestionAnswerAnnotation.State;

const REGION = "us-east-1";
const MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";
async function callBedrockLLM(prompt: string): Promise<any> {
  const bedrockClient = new BedrockRuntimeClient({
    region: REGION,
  });
  const messages = [{ role: "user", content: prompt }];
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

  return output;
}

async function askQuestion(
  state: QuestionAnswerState
): Promise<Partial<QuestionAnswerState>> {
  const args = process.argv.slice(2);
  const question = args.join(" ");

  return {
    question,
  };
}

async function getAnswer(
  state: QuestionAnswerState
): Promise<Partial<QuestionAnswerState>> {
  const output = await callBedrockLLM(state.question);
  const answerText = output?.content?.[0]?.text ?? "No answer returned";

  return {
    answer: answerText,
  };
}

const workflow = new StateGraph(QuestionAnswerAnnotation)
  .addNode("ask_question", askQuestion)
  .addNode("llm_answer", getAnswer)
  .addEdge(START, "ask_question")
  .addEdge("ask_question", "llm_answer")
  .addEdge("llm_answer", END)
  .compile();

async function runWorkflow() {
  const intialState = {
    question: "",
    answer: "",
  };
  const finalState = await workflow.invoke(intialState);
  console.log(finalState);
}

runWorkflow();
