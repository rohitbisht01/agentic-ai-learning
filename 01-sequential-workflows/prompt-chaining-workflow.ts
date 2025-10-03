// prompt chaining here we are not completing task in a single llm call, insted of that we are doing a series of llm calls to acheive it

// topic => generate a detailed outline => for this topic and outline generatee a blog post

import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const WorkflowAnnotation = Annotation.Root({
  topicName: Annotation<string>,
  outline: Annotation<string>,
  blogPost: Annotation<string>,
});
type WorkflowState = typeof WorkflowAnnotation.State;

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

async function generateOutline(
  state: WorkflowState
): Promise<Partial<WorkflowState>> {
  const { topicName } = state;
  const prompt = `Create a clear and well-structured outline for a blog post on the topic: "${topicName}". Ensure the outline covers the key points and organizes the content logically.`;

  const response = await callBedrockLLM(prompt);
  const generatedOutline = response?.content?.[0]?.text ?? "No answer returned";

  return { outline: generatedOutline };
}

async function generateBlogPost(
  state: WorkflowState
): Promise<Partial<WorkflowState>> {
  const { outline, topicName } = state;
  const prompt = `Write a detailed and engaging blog post on the topic "${topicName}" following this outline: ${outline}. Ensure the content is clear, well-structured, and suitable for readers interested in ${topicName}.`;

  const response = await callBedrockLLM(prompt);
  const generatedBlogPost = response?.content[0]?.text ?? "No answer returned";

  return {
    blogPost: generatedBlogPost,
  };
}

const workflow = new StateGraph(WorkflowAnnotation)
  .addNode("generate_outline", generateOutline)
  .addNode("blog_post", generateBlogPost)
  .addEdge(START, "generate_outline")
  .addEdge("generate_outline", "blog_post")
  .addEdge("blog_post", END)
  .compile();

async function runWorkflow() {
  const initalState = {
    topicName: process.argv.slice(2).join(" "),
    outline: "",
    blogPost: "",
  };
  const finalState = await workflow.invoke(initalState);
  console.log(finalState);
}

runWorkflow();
