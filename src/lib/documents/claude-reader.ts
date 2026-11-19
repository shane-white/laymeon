/** The file reader in production: Claude reads the file's text. */
import Anthropic from "@anthropic-ai/sdk";
import { parseDocument } from "@/lib/ai/parse-document";
import { splitProjects } from "@/lib/ai/split-projects";
import { UnreadableFileError, type FileReader } from "./document";

const GENERIC_UNREADABLE = "We couldn't read that file. Try saving it again as a PDF or Word file.";

/**
 * Claude being unavailable is passed on as is. The readers' own
 * `UnreadableFileError`s keep their messages; any other error (such as a
 * corrupt Word file) is unreadable too, with a generic message so internal
 * error text never reaches the user.
 */
async function readOrExplain<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof Anthropic.APIError || err instanceof UnreadableFileError) throw err;
    console.error("Couldn't read an uploaded file", err);
    throw new UnreadableFileError(GENERIC_UNREADABLE);
  }
}

const bytesOf = async (file: File) => Buffer.from(await file.arrayBuffer());

export const claudeReader: FileReader = {
  toMarkdown: (file) =>
    readOrExplain(async () => (await parseDocument(await bytesOf(file), file.type, file.name)).markdown),
  splitExampleWorks: (file) => readOrExplain(async () => splitProjects(await bytesOf(file), file.type, file.name)),
};
