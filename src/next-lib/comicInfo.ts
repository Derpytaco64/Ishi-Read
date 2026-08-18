import fs from "fs";
import zlib from "zlib";

type Series = { name: string; position?: number };

export type CBZFileMetadata = {
  series: Series | null;
  author: string;
  tags: string[];
  publisher: string | null;
  language: string | null;
  description: string | null;
  readingProgression: "rtl" | null;
};

const EMPTY_CBZ_METADATA: CBZFileMetadata = {
  series: null, author: "", tags: [], publisher: null, language: null, description: null, readingProgression: null
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_SIZE = 65535;

function findEndOfCentralDirectory(fd: number, fileSize: number): Buffer | null {
  const searchSize = Math.min(fileSize, EOCD_MIN_SIZE + MAX_COMMENT_SIZE);
  const searchStart = fileSize - searchSize;
  const buf = Buffer.alloc(searchSize);
  fs.readSync(fd, buf, 0, searchSize, searchStart);

  for (let i = buf.length - EOCD_MIN_SIZE; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return buf.subarray(i);
  }
  return null;
}

function readZipEntryData(fd: number, localHeaderOffset: number, compressedSize: number, compressionMethod: number): Buffer | null {
  const localHeader = Buffer.alloc(30);
  fs.readSync(fd, localHeader, 0, 30, localHeaderOffset);
  if (localHeader.readUInt32LE(0) !== LOCAL_FILE_SIGNATURE) return null;

  const fileNameLength = localHeader.readUInt16LE(26);
  const extraFieldLength = localHeader.readUInt16LE(28);
  const dataOffset = localHeaderOffset + 30 + fileNameLength + extraFieldLength;

  const compressed = Buffer.alloc(compressedSize);
  fs.readSync(fd, compressed, 0, compressedSize, dataOffset);

  if (compressionMethod === 0) return compressed;
  if (compressionMethod === 8) return zlib.inflateRawSync(compressed);
  return null;
}

// CLAUDE-ADDED: Hand-rolled instead of pulling in a zip library (there's no node/pnpm on the dev
// machine this was written on to install and test one) -- CBZ metadata extraction only ever needs to
// pull one small entry (ComicInfo.xml) out of what's otherwise a multi-hundred-MB archive of page
// images, so this reads just the End of Central Directory + Central Directory (a few KB) rather than
// the whole file, and only decompresses the one matching entry. No ZIP64 support -- not needed for
// the CBZ files this targets (ComicInfo.xml stays tiny regardless of how large the archive gets, and
// >4GB single-volume CBZs are not a case worth handling here).
export function extractZipEntry(filePath: string, entryName: string): Buffer | null {
  const fd = fs.openSync(filePath, "r");
  try {
    const fileSize = fs.fstatSync(fd).size;
    if (fileSize < EOCD_MIN_SIZE) return null;

    const eocd = findEndOfCentralDirectory(fd, fileSize);
    if (!eocd) return null;

    const centralDirSize = eocd.readUInt32LE(12);
    const centralDirOffset = eocd.readUInt32LE(16);
    const totalEntries = eocd.readUInt16LE(10);
    if (centralDirOffset === 0xffffffff || centralDirSize === 0xffffffff) return null;

    const centralDir = Buffer.alloc(centralDirSize);
    fs.readSync(fd, centralDir, 0, centralDirSize, centralDirOffset);

    let pos = 0;
    const targetName = entryName.toLowerCase();
    for (let i = 0; i < totalEntries && pos + 46 <= centralDir.length; i++) {
      if (centralDir.readUInt32LE(pos) !== CENTRAL_DIR_SIGNATURE) break;

      const compressionMethod = centralDir.readUInt16LE(pos + 10);
      const compressedSize = centralDir.readUInt32LE(pos + 20);
      const fileNameLength = centralDir.readUInt16LE(pos + 28);
      const extraFieldLength = centralDir.readUInt16LE(pos + 30);
      const fileCommentLength = centralDir.readUInt16LE(pos + 32);
      const localHeaderOffset = centralDir.readUInt32LE(pos + 42);

      const nameStart = pos + 46;
      const name = centralDir.toString("utf-8", nameStart, nameStart + fileNameLength).toLowerCase();

      if (name === targetName || name.endsWith(`/${targetName}`)) {
        return readZipEntryData(fd, localHeaderOffset, compressedSize, compressionMethod);
      }

      pos = nameStart + fileNameLength + extraFieldLength + fileCommentLength;
    }

    return null;
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

function getTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return null;
  const value = unescapeXml(match[1]).trim();
  return value || null;
}

function splitNames(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

// CLAUDE-ADDED: mirrors dedupeNames in books/route.ts (kept local instead of imported to keep this
// module standalone) -- manga ComicInfo.xml commonly repeats the same mangaka across Writer/
// Penciller/Inker/CoverArtist, so a naive concat would show "Kazuhiro Fujita" four times.
function dedupeCaseInsensitive(names: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(name);
    }
  }
  return unique;
}

// CLAUDE-ADDED: The bundled Go readium server's CBZ/Divina parser doesn't read ComicInfo.xml at all
// (confirmed against the binary -- no ComicInfo/Series/Volume/Manga struct tags anywhere in it), so
// everything here comes straight off the file's own embedded ComicInfo.xml (the de facto ComicRack/
// Kavita/Komga standard) instead of the manifest. Mirrors extractAudiobookMetadata's role for M4B.
export function extractCBZMetadata(filePath: string): CBZFileMetadata {
  try {
    const xmlBuffer = extractZipEntry(filePath, "ComicInfo.xml");
    if (!xmlBuffer) return EMPTY_CBZ_METADATA;
    const xml = xmlBuffer.toString("utf-8");

    const seriesName = getTag(xml, "Series");
    // CLAUDE-ADDED: Volume (which tankobon this file is) takes priority over Number (issue number
    // within the series) as the series position -- each CBZ in this library is one bound volume, so
    // Volume is the number a "Book N of series" label should show; Number is a finer-grained
    // chapter/issue field scanlation groups sometimes leave at "1.0" for every volume.
    const volume = getTag(xml, "Volume");
    const number = getTag(xml, "Number");
    const positionRaw = volume ?? number;
    const position = positionRaw ? Number(positionRaw) : NaN;
    const series: Series | null = seriesName
      ? { name: seriesName, position: Number.isFinite(position) ? position : undefined }
      : null;

    const roles = ["Writer", "Penciller", "Inker", "Colorist", "Letterer", "CoverArtist"];
    const names = roles.flatMap((role) => splitNames(getTag(xml, role)));
    const author = dedupeCaseInsensitive(names).join(", ");

    const genre = getTag(xml, "Genre");
    const tags = genre ? genre.split(",").map((g) => g.trim()).filter(Boolean) : [];

    const manga = getTag(xml, "Manga");
    const readingProgression = manga?.toLowerCase() === "yesandrighttoleft" ? "rtl" : null;

    return {
      series,
      author,
      tags,
      publisher: getTag(xml, "Publisher"),
      language: getTag(xml, "LanguageISO"),
      description: getTag(xml, "Summary"),
      readingProgression,
    };
  } catch (err) {
    console.error(`Could not read ComicInfo.xml for ${filePath}:`, err);
    return EMPTY_CBZ_METADATA;
  }
}
