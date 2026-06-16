import { getServerEnv } from "./serverEnv";

export function buildOpenAIHeaders(
  apiKey: string,
  contentType: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": contentType,
  };

  const organization =
    getServerEnv("OPENAI_ORGANIZATION") ?? getServerEnv("OPENAI_ORG_ID");
  const project = getServerEnv("OPENAI_PROJECT") ?? getServerEnv("OPENAI_PROJECT_ID");

  if (organization) headers["OpenAI-Organization"] = organization;
  if (project) headers["OpenAI-Project"] = project;
  return headers;
}
