import { inflateRawSync } from "node:zlib";

/** The text of one entry of a ZIP archive, such as word/document.xml. */
export function extractZipEntry(bytes: Uint8Array, targetName: string): string {
  const archive = Buffer.from(bytes);
  const endOfCentralDirectory = archive.lastIndexOf(
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  );
  if (endOfCentralDirectory < 0) throw new Error("ZIP directory not found");

  const entryCount = archive.readUInt16LE(endOfCentralDirectory + 10);
  let directoryOffset = archive.readUInt32LE(endOfCentralDirectory + 16);

  for (let index = 0; index < entryCount; index++) {
    if (archive.readUInt32LE(directoryOffset) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory entry");
    }

    const compressionMethod = archive.readUInt16LE(directoryOffset + 10);
    const compressedSize = archive.readUInt32LE(directoryOffset + 20);
    const fileNameLength = archive.readUInt16LE(directoryOffset + 28);
    const extraLength = archive.readUInt16LE(directoryOffset + 30);
    const commentLength = archive.readUInt16LE(directoryOffset + 32);
    const localHeaderOffset = archive.readUInt32LE(directoryOffset + 42);
    const fileName = archive
      .subarray(directoryOffset + 46, directoryOffset + 46 + fileNameLength)
      .toString("utf8");

    if (fileName === targetName) {
      if (archive.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error("Invalid ZIP local file header");
      }
      const localFileNameLength = archive.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
      const dataOffset =
        localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = archive.subarray(
        dataOffset,
        dataOffset + compressedSize,
      );

      if (compressionMethod === 0) return compressed.toString("utf8");
      if (compressionMethod === 8) {
        return inflateRawSync(compressed).toString("utf8");
      }
      throw new Error(
        `Unsupported ZIP compression method: ${compressionMethod}`,
      );
    }

    directoryOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(`ZIP entry not found: ${targetName}`);
}
