import { MessageSquare } from "lucide-react";

export function DocumentChatPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 border-l text-muted-foreground">
      <MessageSquare className="h-8 w-8" />
      <p className="text-sm font-medium">Document Chat</p>
      <p className="text-xs">Coming soon</p>
    </div>
  );
}
