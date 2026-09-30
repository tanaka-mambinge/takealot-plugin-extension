export type ClipboardWriter = { writeText: (value: string) => Promise<void> };

export async function copyText(value: string, clipboard?: ClipboardWriter): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
