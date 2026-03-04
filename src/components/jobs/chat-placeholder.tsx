import { MessageSquare } from "lucide-react";

export function ChatPlaceholder() {
  return (
    <div className="flex h-full w-80 flex-col items-center justify-center gap-2 border-l text-muted-foreground">
      <MessageSquare className="h-8 w-8" />
      <p className="text-sm font-medium">Chat</p>
      <p className="text-xs">Coming soon</p>
    </div>
  );
}
