import { inflateSync } from "node:zlib";

export function extractPdfStreamText(bytes: Uint8Array): string {
  const pdf = Buffer.from(bytes);
  const streamMarker = Buffer.from("stream\n");
  const endStreamMarker = Buffer.from("\nendstream");
  const dictionaryMarker = Buffer.from("<<");
  const textChunks: string[] = [];
  let cursor = 0;

  while (cursor < pdf.length) {
    const streamOffset = pdf.indexOf(streamMarker, cursor);
    if (streamOffset < 0) break;

    const dataOffset = streamOffset + streamMarker.length;
    const dictionaryOffset = pdf.lastIndexOf(dictionaryMarker, streamOffset);
    const dictionary = pdf
      .subarray(Math.max(0, dictionaryOffset), streamOffset)
      .toString("latin1");
    const lengthMatch = /\/Length\s+(\d+)/.exec(dictionary);
    const fallbackEnd = pdf.indexOf(endStreamMarker, dataOffset);
    const dataEnd = lengthMatch
      ? dataOffset + Number(lengthMatch[1])
      : fallbackEnd;

    if (dataEnd < dataOffset) break;

    const stream = pdf.subarray(dataOffset, dataEnd);
    if (dictionary.includes("/FlateDecode")) {
      textChunks.push(inflateSync(stream).toString("latin1"));
    } else {
      textChunks.push(stream.toString("latin1"));
    }

    cursor = dataEnd + endStreamMarker.length;
  }

  return textChunks.join("\n");
}
