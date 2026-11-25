"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DECK_KEYS, type DeckKey } from "@/lib/interview-prep/interview-prep";
import { MAX_QUESTION_CHARS } from "@/lib/interview-prep/practice/operations";
import { DECK_NAMES, Tip, TIPS } from "./practice-parts";

/** The Add your own question button and its dialog: a question and the Deck to put it in. */
export function AddQuestionDialog({ onAdd }: { onAdd: (deck: DeckKey, question: string) => void }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [deck, setDeck] = useState<DeckKey>("behavioral");
  const text = question.trim();

  return (
    <>
      <Tip text={TIPS.addOwn}>
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Plus /> Add your own question
        </Button>
      </Tip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text) return;
              onAdd(deck, text);
              setQuestion("");
              setOpen(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>Add your own question</DialogTitle>
              <DialogDescription>
                A question you&rsquo;ve been warned about, or one you&rsquo;d like to be ready for. We&rsquo;ll write a
                hint for it like the other cards.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="own-question">Question</Label>
              <Textarea
                id="own-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Why did you leave your last job after a year?"
                rows={3}
                maxLength={MAX_QUESTION_CHARS}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="own-deck">Deck</Label>
              <Select value={deck} onValueChange={(value) => setDeck(value as DeckKey)}>
                <SelectTrigger id="own-deck" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DECK_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {DECK_NAMES[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!text}>
                Add question
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
