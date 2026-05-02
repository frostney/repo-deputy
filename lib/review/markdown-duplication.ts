import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import type { Dirent } from "node:fs";
import type { Finding, RepoFile, ReviewContext } from "@/lib/review/types";

type MarkdownDoc = {
  path: string;
  content: string;
  absolutePath?: string;
};

type WordLocation = {
  file: string;
  line: number;
  col: number;
};

type WordEntry = {
  word: string;
  loc: WordLocation;
};

type CloneLocation = {
  file: string;
  line: number;
  endLine: number;
  section: string | null;
};

type Clone = {
  words: string[];
  locations: CloneLocation[];
};

type Paragraph = {
  file: string;
  startLine: number;
  endLine: number;
  words: string[];
  contentWords: string[];
  text: string;
  section: string | null;
};

type FuzzyCluster = {
  paragraphs: Paragraph[];
  canonical: Paragraph;
  avgSimilarity: number;
};

type HeadingEntry = {
  line: number;
  depth: number;
  text: string;
  slug: string;
};

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "need",
  "must",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "our",
  "their",
  "what",
  "which",
  "who",
  "whom",
  "how",
  "when",
  "where",
  "why",
  "if",
  "then",
  "else",
  "so",
  "as",
  "not",
  "no",
  "nor",
  "also",
  "just",
  "only",
  "very",
  "too",
  "more",
  "most",
  "such",
  "each",
  "every",
  "all",
  "any",
  "both",
  "few",
  "some",
  "many",
  "much",
  "own",
  "other",
  "about",
  "up",
  "out",
  "into",
  "over",
  "after",
  "before",
  "between",
  "through",
  "during",
  "above",
  "below",
  "than",
  "because",
  "while",
]);

const MIN_WORDS = 35;
const MIN_LOCATIONS = 2;
const FUZZY_THRESHOLD = 0.65;
const FUZZY_MIN_WORDS = 15;
const NUM_HASHES = 128;
const NUM_BANDS = 32;
const ROWS_PER_BAND = NUM_HASHES / NUM_BANDS;
const SUFFIX_CMP_CAP = 64;
const LARGE_PRIME = 4_294_967_311;
const WORD_RE = /[a-zA-Z0-9_\-'.]+/g;
const URL_RE = /https?:\/\/[^\s)>\]]+/g;
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".agents",
  "dist",
  "build",
  ".next",
  "vendor",
]);
const IGNORE_PATH_PREFIXES = ["website/content/docs/"];
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);
const MAX_EVIDENCE = 8;
const MAX_FILES = 12;

const range = (n: number): number[] => Array.from({ length: n }, (_, index) => index);
const rangeFrom = (start: number, end: number): number[] =>
  Array.from({ length: end - start }, (_, index) => start + index);
const suffixCompareRange = range(SUFFIX_CMP_CAP);

const hashCoeffs: [number, number][] = (() => {
  let seed = 42;
  const next = (): number => {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
    return seed;
  };
  return Array.from({ length: NUM_HASHES }, (): [number, number] => [next(), next()]);
})();

export function runMarkdownDuplicationChecks(context: ReviewContext): Finding[] {
  const docs = loadMarkdownDocs(context);
  if (docs.length < 2) {
    return [];
  }

  const { clones, clusters } = analyzeDocs(docs);
  const findings: Finding[] = [];

  if (clones.length > 0) {
    findings.push(buildExactDuplicateFinding(clones));
  }

  if (clusters.length > 0) {
    findings.push(buildFuzzyDuplicateFinding(clusters));
  }

  return findings;
}

function loadMarkdownDocs(context: ReviewContext): MarkdownDoc[] {
  if (context.rootPath && existsSync(context.rootPath)) {
    return readMarkdownDocsFromRoot(context.rootPath);
  }

  const docs = new Map<string, MarkdownDoc>();
  for (const file of [context.readme, ...context.docsFiles]) {
    addRepoFile(docs, file);
  }

  for (const file of context.changedFiles) {
    if (file.content && isMarkdownPath(file.filename)) {
      docs.set(normalizeRepoPath(file.filename), {
        path: normalizeRepoPath(file.filename),
        content: file.content,
      });
    }
  }

  return [...docs.values()]
    .filter((doc) => !isIgnoredRepoPath(doc.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function readMarkdownDocsFromRoot(rootPath: string): MarkdownDoc[] {
  const docs: MarkdownDoc[] = [];
  const seen = new Set<string>();

  function walk(directory: string) {
    let entries: Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = normalizeRepoPath(path.relative(rootPath, absolutePath));

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name) && !isIgnoredRepoPath(relativePath)) {
          walk(absolutePath);
        }
        continue;
      }

      if (
        !entry.isFile() ||
        !isMarkdownPath(relativePath) ||
        isIgnoredRepoPath(relativePath)
      ) {
        continue;
      }

      let realPath = absolutePath;
      try {
        realPath = lstatSync(absolutePath).isSymbolicLink()
          ? realpathSync(absolutePath)
          : absolutePath;
      } catch {
        continue;
      }

      if (seen.has(realPath)) {
        continue;
      }
      seen.add(realPath);

      try {
        docs.push({
          path: relativePath,
          absolutePath,
          content: readFileSync(absolutePath, "utf8"),
        });
      } catch {}
    }
  }

  walk(rootPath);
  return docs.sort((a, b) => a.path.localeCompare(b.path));
}

function analyzeDocs(docs: MarkdownDoc[]) {
  const headingsByFile = new Map<string, HeadingEntry[]>();
  const corpus: WordEntry[] = [];
  const paragraphs: Paragraph[] = [];

  for (const [fileIndex, doc] of docs.entries()) {
    const headings = buildHeadingIndex(doc.content);
    headingsByFile.set(doc.path, headings);
    const cleaned = stripCodeBlocks(doc.content);

    corpus.push(...tokenise(cleaned, doc.path));
    corpus.push({
      word: `\0FILE_BOUNDARY_${fileIndex}`,
      loc: { file: doc.path, line: 0, col: 0 },
    });
    paragraphs.push(...extractParagraphs(doc.content, doc.path, headings));
  }

  let clones: Clone[] = [];
  if (corpus.length >= MIN_WORDS) {
    const words = corpus.map((entry) => entry.word);
    const suffixArray = buildSuffixArray(words);
    const lcpArray = buildLCPArray(words, suffixArray);
    clones = detectClones(
      corpus,
      suffixArray,
      lcpArray,
      MIN_WORDS,
      MIN_LOCATIONS,
      headingsByFile,
    );
    clones = deduplicateClones(clones);
  }

  let clusters = detectFuzzyClusters(paragraphs, FUZZY_THRESHOLD);
  clusters = filterClustersAgainstExact(clusters, clones);

  return { clones, clusters };
}

function addRepoFile(docs: Map<string, MarkdownDoc>, file: RepoFile | null) {
  if (!file || !isMarkdownPath(file.path)) {
    return;
  }

  const filePath = normalizeRepoPath(file.path);
  docs.set(filePath, { path: filePath, content: file.content });
}

function buildExactDuplicateFinding(clones: Clone[]): Finding {
  const evidence = clones.slice(0, MAX_EVIDENCE).map((clone, index) => {
    const locations = clone.locations.slice(0, 3).map(formatLocation).join(", ");
    const extra =
      clone.locations.length > 3 ? `, plus ${clone.locations.length - 3} more` : "";
    return `Clone ${index + 1}: ${clone.words.length} words duplicated at ${locations}${extra}.`;
  });

  return {
    id: "docs-markdown-duplicate-exact",
    category: "docs-drift",
    severity: "medium",
    title: "Markdown docs contain duplicated prose",
    summary: `Repo Deputy found ${clones.length} exact duplicated markdown prose clone${
      clones.length === 1 ? "" : "s"
    }.`,
    evidence,
    files: unique(
      clones.flatMap((clone) => clone.locations.map((location) => location.file)),
    ).slice(0, MAX_FILES),
    suggestedFix:
      "Keep one canonical version of the duplicated prose and replace other copies with links or shorter references.",
    confidence: 0.84,
  };
}

function buildFuzzyDuplicateFinding(clusters: FuzzyCluster[]): Finding {
  const evidence = clusters.slice(0, MAX_EVIDENCE).map((cluster, index) => {
    const locations = cluster.paragraphs.slice(0, 3).map(formatParagraph).join(", ");
    const extra =
      cluster.paragraphs.length > 3 ? `, plus ${cluster.paragraphs.length - 3} more` : "";
    return `Cluster ${index + 1}: ${cluster.paragraphs.length} near-duplicate paragraphs at ${locations}${extra} (~${Math.round(
      cluster.avgSimilarity * 100,
    )}% similar).`;
  });

  return {
    id: "docs-markdown-duplicate-fuzzy",
    category: "docs-drift",
    severity: "low",
    title: "Markdown docs contain near-duplicate prose",
    summary: `Repo Deputy found ${clusters.length} near-duplicate markdown prose cluster${
      clusters.length === 1 ? "" : "s"
    }.`,
    evidence,
    files: unique(
      clusters.flatMap((cluster) =>
        cluster.paragraphs.map((paragraph) => paragraph.file),
      ),
    ).slice(0, MAX_FILES),
    suggestedFix:
      "Review the similar sections and consolidate any prose that should have a single source of truth.",
    confidence: 0.66,
  };
}

function buildHeadingIndex(content: string): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  const lines = content.split("\n");
  let inCode = false;

  for (const [index, line] of lines.entries()) {
    if (/^```/.test(line.trim())) {
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      continue;
    }

    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const text = match[2].replace(/\s*#+\s*$/, "").trim();
      const slug = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
      headings.push({ line: index + 1, depth: match[1].length, text, slug });
    }
  }

  return headings;
}

function findSection(headings: HeadingEntry[], line: number): string | null {
  let best: HeadingEntry | null = null;
  for (const heading of headings) {
    if (heading.line <= line) {
      best = heading;
    } else {
      break;
    }
  }
  return best ? best.text : null;
}

function stripCodeBlocks(content: string) {
  const lines = content.split("\n");
  let inCode = false;
  return lines
    .map((line) => {
      if (/^```/.test(line.trim())) {
        inCode = !inCode;
        return "";
      }
      return inCode ? "" : line;
    })
    .join("\n");
}

function stripUrls(line: string): string {
  return line.replace(URL_RE, "");
}

function tokenise(content: string, file: string): WordEntry[] {
  const entries: WordEntry[] = [];
  const lines = content.split("\n");

  for (const [lineIndex, line] of lines.entries()) {
    if (/^<!--/.test(line.trim()) || /^---$/.test(line.trim())) {
      continue;
    }

    const cleaned = stripUrls(line);
    for (const match of cleaned.matchAll(WORD_RE)) {
      entries.push({
        word: match[0].toLowerCase(),
        loc: { file, line: lineIndex + 1, col: (match.index ?? 0) + 1 },
      });
    }
  }

  return entries;
}

function buildSuffixArray(words: string[]): Int32Array {
  const indices = new Int32Array(words.length);
  for (const index of range(words.length)) {
    indices[index] = index;
  }

  indices.sort((a, b) => {
    const length = Math.min(words.length - a, words.length - b, SUFFIX_CMP_CAP);
    for (const offset of suffixCompareRange) {
      if (offset >= length) {
        break;
      }
      if (words[a + offset] < words[b + offset]) {
        return -1;
      }
      if (words[a + offset] > words[b + offset]) {
        return 1;
      }
    }
    return words.length - a - (words.length - b);
  });

  return indices;
}

function buildLCPArray(words: string[], suffixArray: Int32Array): Int32Array {
  const rank = new Int32Array(suffixArray.length);
  for (const index of range(suffixArray.length)) {
    rank[suffixArray[index]] = index;
  }

  const lcp = new Int32Array(suffixArray.length);
  let height = 0;
  for (const index of range(suffixArray.length)) {
    if (rank[index] > 0) {
      const other = suffixArray[rank[index] - 1];
      for (const _ of suffixCompareRange) {
        if (
          !(
            index + height < words.length &&
            other + height < words.length &&
            words[index + height] === words[other + height]
          )
        ) {
          break;
        }
        height++;
      }
      lcp[rank[index]] = height;
      if (height > 0) {
        height--;
      }
    }
  }

  return lcp;
}

function detectClones(
  corpus: WordEntry[],
  suffixArray: Int32Array,
  lcp: Int32Array,
  minWords: number,
  minLocations: number,
  headingsByFile: Map<string, HeadingEntry[]>,
): Clone[] {
  const words = corpus.map((entry) => entry.word);
  const clones: Clone[] = [];
  const seen = new Set<string>();
  let skip = 0;

  for (const index of range(suffixArray.length)) {
    if (skip > 0) {
      skip--;
      continue;
    }
    if (lcp[index] < minWords) {
      continue;
    }

    const clusterStart = index - 1;
    let clusterEnd = index;
    let shared = lcp[index];
    for (const next of rangeFrom(index + 1, suffixArray.length)) {
      if (lcp[next] < minWords) {
        break;
      }
      shared = Math.min(shared, lcp[next]);
      clusterEnd = next;
    }

    const phrase = words
      .slice(suffixArray[clusterStart], suffixArray[clusterStart] + shared)
      .join(" ");
    if (seen.has(phrase)) {
      skip = clusterEnd - index;
      continue;
    }
    seen.add(phrase);

    const locationsByKey = new Map<string, CloneLocation>();
    for (const matchIndex of rangeFrom(clusterStart, clusterEnd + 1)) {
      const startIndex = suffixArray[matchIndex];
      const endIndex = startIndex + shared - 1;
      const loc = corpus[startIndex].loc;
      const endLoc = corpus[endIndex].loc;
      const key = `${loc.file}:${loc.line}`;

      if (!locationsByKey.has(key)) {
        const headings = headingsByFile.get(loc.file) ?? [];
        locationsByKey.set(key, {
          file: loc.file,
          line: loc.line,
          endLine: endLoc.line,
          section: findSection(headings, loc.line),
        });
      }
    }

    const locations = [...locationsByKey.values()];
    if (locations.length >= minLocations) {
      clones.push({
        words: words.slice(suffixArray[clusterStart], suffixArray[clusterStart] + shared),
        locations,
      });
    }
    skip = clusterEnd - index;
  }

  return clones;
}

function deduplicateClones(clones: Clone[]): Clone[] {
  clones.sort((a, b) => b.words.length - a.words.length);
  const kept: Clone[] = [];
  const covered = new Set<string>();

  for (const clone of clones) {
    const keys = clone.locations.map((location) => `${location.file}:${location.line}`);
    if (!keys.every((key) => covered.has(key))) {
      kept.push(clone);
      for (const key of keys) {
        covered.add(key);
      }
    }
  }

  return kept;
}

function pushParagraph(
  lines: string[],
  file: string,
  startLine: number,
  endLineExcl: number,
  headings: HeadingEntry[],
  paragraphs: Paragraph[],
): void {
  const text = stripUrls(lines.join(" "));
  const words = [...text.matchAll(WORD_RE)].map((match) => match[0].toLowerCase());

  if (words.length >= FUZZY_MIN_WORDS) {
    paragraphs.push({
      file,
      startLine,
      endLine: endLineExcl,
      words,
      contentWords: filterStopwords(words),
      text,
      section: findSection(headings, startLine),
    });
  }
}

function extractParagraphs(
  content: string,
  file: string,
  headings: HeadingEntry[],
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = content.split("\n");
  let current: string[] = [];
  let startLine = 1;
  let inCode = false;

  for (const [index, line] of lines.entries()) {
    if (/^```/.test(line.trim())) {
      inCode = !inCode;
      if (current.length > 0) {
        pushParagraph(current, file, startLine, index, headings, paragraphs);
        current = [];
      }
      startLine = index + 2;
      continue;
    }
    if (inCode) {
      continue;
    }

    const trimmed = line.trim();
    if (trimmed === "") {
      if (current.length > 0) {
        pushParagraph(current, file, startLine, index, headings, paragraphs);
        current = [];
      }
      startLine = index + 2;
    } else {
      current.push(trimmed);
    }
  }

  if (current.length > 0) {
    pushParagraph(current, file, startLine, lines.length, headings, paragraphs);
  }

  return paragraphs;
}

function filterStopwords(words: string[]): string[] {
  return words.filter((word) => !STOPWORDS.has(word) && word.length > 1);
}

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return hash >>> 0;
}

function mulMod(a: number, b: number, mod: number): number {
  let result = 0;
  let base = a % mod;
  let exp = b;

  for (const _ of range(32)) {
    if (exp <= 0) {
      break;
    }
    if (exp % 2 === 1) {
      result = (result + base) % mod;
    }
    base = (base * 2) % mod;
    exp = Math.floor(exp / 2);
  }

  return result;
}

function computeUnigrams(words: string[]): Set<number> {
  const hashes = new Set<number>();
  for (const word of words) {
    hashes.add(hashString(word));
  }
  return hashes;
}

function computeBigrams(words: string[]): Set<string> {
  const bigrams = new Set<string>();
  for (const [index, word] of words.slice(0, -1).entries()) {
    bigrams.add(`${word} ${words[index + 1]}`);
  }
  return bigrams;
}

function trueJaccard<T>(a: Set<T>, b: Set<T>): number {
  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) {
      intersection++;
    }
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function blendedSimilarity(a: Paragraph, b: Paragraph): number {
  const unigramSimilarity = trueJaccard(new Set(a.contentWords), new Set(b.contentWords));
  const bigramSimilarity = trueJaccard(
    computeBigrams(a.contentWords),
    computeBigrams(b.contentWords),
  );
  return 0.6 * unigramSimilarity + 0.4 * bigramSimilarity;
}

function minHash(shingles: Set<number>): Uint32Array {
  const signature = new Uint32Array(NUM_HASHES).fill(0xffffffff);
  for (const shingle of shingles) {
    for (const index of range(NUM_HASHES)) {
      const [a, b] = hashCoeffs[index];
      const hash = (mulMod(a, shingle, LARGE_PRIME) + b) % LARGE_PRIME;
      if (hash < signature[index]) {
        signature[index] = hash;
      }
    }
  }
  return signature;
}

function lshCandidates(signatures: Uint32Array[]): Set<string> {
  const candidates = new Set<string>();
  const buckets = new Map<string, number[]>();

  for (const band of range(NUM_BANDS)) {
    buckets.clear();
    const offset = band * ROWS_PER_BAND;

    for (const [docIndex, signature] of signatures.entries()) {
      let key = `${band}:`;
      for (const row of range(ROWS_PER_BAND)) {
        key += `${signature[offset + row].toString(36)},`;
      }

      const bucket = buckets.get(key);
      if (bucket) {
        for (const other of bucket) {
          candidates.add(
            other < docIndex ? `${other}:${docIndex}` : `${docIndex}:${other}`,
          );
        }
        bucket.push(docIndex);
      } else {
        buckets.set(key, [docIndex]);
      }
    }
  }

  return candidates;
}

class UnionFind {
  parent: number[];
  rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
    this.rank = new Array(size).fill(0);
  }

  find(value: number): number {
    if (this.parent[value] !== value) {
      this.parent[value] = this.find(this.parent[value]);
    }
    return this.parent[value];
  }

  union(a: number, b: number): void {
    const aRoot = this.find(a);
    const bRoot = this.find(b);
    if (aRoot === bRoot) {
      return;
    }

    if (this.rank[aRoot] < this.rank[bRoot]) {
      this.parent[aRoot] = bRoot;
    } else if (this.rank[aRoot] > this.rank[bRoot]) {
      this.parent[bRoot] = aRoot;
    } else {
      this.parent[bRoot] = aRoot;
      this.rank[aRoot]++;
    }
  }
}

function detectFuzzyClusters(paragraphs: Paragraph[], threshold: number): FuzzyCluster[] {
  if (paragraphs.length < 2) {
    return [];
  }

  const signatures = paragraphs.map((paragraph) =>
    minHash(computeUnigrams(paragraph.contentWords)),
  );
  const candidates = lshCandidates(signatures);
  const unionFind = new UnionFind(paragraphs.length);
  const edges: { ai: number; bi: number; sim: number }[] = [];

  for (const pair of candidates) {
    const [ai, bi] = pair.split(":").map((part) => Number.parseInt(part, 10));
    if (
      paragraphs[ai].file === paragraphs[bi].file &&
      paragraphs[ai].startLine === paragraphs[bi].startLine
    ) {
      continue;
    }

    const similarity = blendedSimilarity(paragraphs[ai], paragraphs[bi]);
    if (similarity >= threshold) {
      unionFind.union(ai, bi);
      edges.push({ ai, bi, sim: similarity });
    }
  }

  const groups = new Map<
    number,
    { indices: Set<number>; totalSimilarity: number; edgeCount: number }
  >();
  for (const { ai, bi, sim } of edges) {
    const root = unionFind.find(ai);
    let group = groups.get(root);
    if (!group) {
      group = { indices: new Set(), totalSimilarity: 0, edgeCount: 0 };
      groups.set(root, group);
    }
    group.indices.add(ai);
    group.indices.add(bi);
    group.totalSimilarity += sim;
    group.edgeCount++;
  }

  const clusters: FuzzyCluster[] = [];
  for (const group of groups.values()) {
    const groupParagraphs = [...group.indices].map((index) => paragraphs[index]);
    const canonical = groupParagraphs.reduce((best, paragraph) =>
      paragraph.words.length > best.words.length ? paragraph : best,
    );
    clusters.push({
      paragraphs: groupParagraphs,
      canonical,
      avgSimilarity: group.totalSimilarity / group.edgeCount,
    });
  }

  return clusters.sort(
    (a, b) =>
      b.paragraphs.length - a.paragraphs.length || b.avgSimilarity - a.avgSimilarity,
  );
}

function filterClustersAgainstExact(
  clusters: FuzzyCluster[],
  exact: Clone[],
): FuzzyCluster[] {
  const exactCovered = new Set<string>();
  for (const clone of exact) {
    for (const location of clone.locations) {
      for (const offset of range(location.endLine - location.line + 1)) {
        exactCovered.add(`${location.file}:${location.line + offset}`);
      }
    }
  }

  return clusters.filter((cluster) =>
    cluster.paragraphs.some(
      (paragraph) => !exactCovered.has(`${paragraph.file}:${paragraph.startLine}`),
    ),
  );
}

function formatLocation(location: CloneLocation) {
  const rangeText =
    location.line === location.endLine
      ? `L${location.line}`
      : `L${location.line}-L${location.endLine}`;
  const section = location.section ? ` (${location.section})` : "";
  return `${location.file}:${rangeText}${section}`;
}

function formatParagraph(paragraph: Paragraph) {
  const section = paragraph.section ? ` (${paragraph.section})` : "";
  return `${paragraph.file}:L${paragraph.startLine}-L${paragraph.endLine}${section}`;
}

function isMarkdownPath(filePath: string) {
  return MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isIgnoredRepoPath(filePath: string) {
  const normalized = normalizeRepoPath(filePath);
  const parts = normalized.split("/");
  return (
    parts.some((part) => IGNORE_DIRS.has(part)) ||
    IGNORE_PATH_PREFIXES.some(
      (prefix) =>
        normalized === prefix.replace(/\/$/, "") || normalized.startsWith(prefix),
    )
  );
}

function normalizeRepoPath(filePath: string) {
  return filePath.split(path.sep).join("/");
}

function unique<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}
