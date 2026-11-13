"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_PROJECT_DESCRIPTION_LENGTH,
  MAX_PROJECT_TITLE_LENGTH,
  PROJECT_GUIDANCE,
  PROJECT_PROMPT,
} from "@/lib/projects";

interface ProjectFieldsProps {
  idPrefix: string;
  title: string;
  description: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  disabled?: boolean;
  titleRef?: React.Ref<HTMLInputElement>;
  autoFocus?: boolean;
}

/** Title and description fields for a project, with writing guidance. */
export function ProjectFields({
  idPrefix,
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  disabled,
  titleRef,
  autoFocus,
}: ProjectFieldsProps) {
  const guidanceId = `${idPrefix}-guidance`;
  const nearLimit = description.length > MAX_PROJECT_DESCRIPTION_LENGTH * 0.9;

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-title`}>Title</Label>
        <Input
          id={`${idPrefix}-title`}
          ref={titleRef}
          value={title}
          maxLength={MAX_PROJECT_TITLE_LENGTH}
          placeholder="e.g. Checkout redesign at Acme"
          onChange={(e) => onTitleChange(e.target.value)}
          disabled={disabled}
          autoFocus={autoFocus}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={description}
          maxLength={MAX_PROJECT_DESCRIPTION_LENGTH}
          placeholder={PROJECT_PROMPT}
          onChange={(e) => onDescriptionChange(e.target.value)}
          disabled={disabled}
          aria-describedby={guidanceId}
          className="max-h-[40vh] min-h-40"
        />
        <div id={guidanceId} className="text-xs text-muted-foreground">
          <p>Good descriptions include:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {PROJECT_GUIDANCE.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {nearLimit && (
            <p className="mt-1 text-right">
              {description.length.toLocaleString()} /{" "}
              {MAX_PROJECT_DESCRIPTION_LENGTH.toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
