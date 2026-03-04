import mammoth from "mammoth";

export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  switch (mimeType) {
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/msword":
      return extractDocxText(buffer);
    case "application/rtf":
    case "application/vnd.oasis.opendocument.text":
      throw new Error(
        "RTF and ODT formats are not yet supported. Please upload a PDF or DOCX file.",
      );
    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
