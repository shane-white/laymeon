"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  Trash2,
  MessageSquare,
  Search,
  ArrowRightLeft,
  FileEdit,
  Loader2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UserJob } from "@/hooks/use-jobs";

interface JobChatProps {
  job: UserJob | null;
}

const SUGGESTIONS = [
  "What skills am I missing?",
  "Search company reviews",
  "Mark as applied",
];

const TOOL_META: Record<string, { icon: typeof Search; label: string }> = {
  search_web: { icon: Search, label: "Searching the web" },
  update_job_status: { icon: ArrowRightLeft, label: "Updating status" },
  update_analysis: { icon: FileEdit, label: "Updating analysis" },
};

export function JobChat({ job }: JobChatProps) {
  const [input, setInput] = useState("");
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const jobIdRef = useRef(job?.id);

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: job ? `job-chat-${job.id}` : undefined,
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    onFinish: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  // Reset messages when job changes
  useEffect(() => {
    if (job?.id !== jobIdRef.current) {
      jobIdRef.current = job?.id;
      setMessages([]);
    }
  }, [job?.id, setMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!job) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 border-l text-muted-foreground">
        <MessageSquare className="h-8 w-8" />
        <p className="text-sm font-medium">Chat</p>
        <p className="text-xs">Select a job to start chatting</p>
      </div>
    );
  }

  const isLoading = status === "streaming" || status === "submitted";

  function handleSend(text: string) {
    if (!text.trim() || isLoading) return;
    sendMessage(
      { text },
      { body: { userJobId: job!.id } },
    );
    setInput("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-l">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Chat</span>
        <div className="flex items-center gap-1">
          {isLoading && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={stop}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </Button>
          )}
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setMessages([])}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="h-0 flex-1">
        <div className="flex flex-col gap-3 px-3 py-3">
          {messages.length === 0 && (
            <div className="flex flex-col gap-2 pt-8 text-center text-xs text-muted-foreground">
              <MessageSquare className="mx-auto h-6 w-6" />
              <p>Ask about this job, search for company info, or update your application.</p>
              <div className="flex flex-wrap justify-center gap-1 pt-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
                    onClick={() => handleSend(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={message.role === "user" ? "flex justify-end" : ""}
            >
              {message.parts.map((part, i) => {
                if (part.type === "text" && part.text) {
                  return (
                    <div
                      key={i}
                      className={`inline-block max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {message.role === "user" ? (
                        part.text
                      ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {part.text}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  );
                }

                if (part.type.startsWith("tool-")) {
                  const toolName = part.type.replace(/^tool-/, "");
                  const meta = TOOL_META[toolName] || {
                    icon: MessageSquare,
                    label: toolName,
                  };
                  const Icon = meta.icon;
                  const isDone = (part as { state?: string }).state === "output-available";

                  return (
                    <div
                      key={i}
                      className="my-1 flex items-center gap-1.5 rounded border px-2 py-1 text-xs text-muted-foreground"
                    >
                      {isDone ? (
                        <Icon className="h-3 w-3" />
                      ) : (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      <span>
                        {meta.label}
                        {isDone ? " — done" : "..."}
                      </span>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          ))}

          {status === "submitted" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Thinking...</span>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <form
        className="border-t px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(input);
        }}
      >
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this job..."
            className="min-h-[36px] max-h-[120px] resize-none text-sm"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={!input.trim() || isLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
