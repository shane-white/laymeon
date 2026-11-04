"use client";

import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

interface JobChatSession {
  chat: Chat<UIMessage>;
  conversationId: string;
}

const sessions = new Map<string, JobChatSession>();

export function getJobChatSession(
  userJobId: string,
  onFinish: () => void,
): JobChatSession {
  const existing = sessions.get(userJobId);
  if (existing) return existing;

  const session = { conversationId: crypto.randomUUID() } as JobChatSession;
  session.chat = new Chat<UIMessage>({
    id: `job-chat-${userJobId}`,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({ userJobId, conversationId: session.conversationId }),
    }),
    onFinish,
  });
  sessions.set(userJobId, session);
  return session;
}

export function startNewConversation(userJobId: string) {
  const session = sessions.get(userJobId);
  if (session) session.conversationId = crypto.randomUUID();
}

export function setConversation(userJobId: string, conversationId: string) {
  const session = sessions.get(userJobId);
  if (session) session.conversationId = conversationId;
}

export function clearJobChats() {
  sessions.clear();
}
