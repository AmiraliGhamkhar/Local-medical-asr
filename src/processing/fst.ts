/**
 * Longest-match phrase rewriter.
 *
 * A token-bounded trie over segmented words. Matching is whole-word by
 * construction: `IV` can never fire inside another word, which is the bug
 * that makes naive substring FSTs dangerous in a medical product. Longest
 * match wins, so "سی تی اسکن با کنتراست" beats "سی" and "تی".
 */

export interface TrieMatch<T> {
  start: number;
  end: number;
  value: T;
}

interface TrieNode<T> {
  children: Map<string, TrieNode<T>>;
  value?: T;
}

export class PhraseTrie<T> {
  private readonly root: TrieNode<T> = { children: new Map() };
  private maxLength = 1;

  constructor(entries: Iterable<[words: string[], value: T]>) {
    for (const [words, value] of entries) {
      this.insert(words, value);
    }
  }

  insert(words: string[], value: T): void {
    if (words.length === 0) return;
    let node = this.root;
    for (const word of words) {
      let next = node.children.get(word);
      if (!next) {
        next = { children: new Map() };
        node.children.set(word, next);
      }
      node = next;
    }
    node.value = value;
    this.maxLength = Math.max(this.maxLength, words.length);
  }

  get size(): number {
    return this.maxLength;
  }

  /**
   * Scan `words` left to right, returning non-overlapping longest matches
   * with the text in between, in order.
   */
  scan(words: string[]): Array<{ words: string[]; value?: T; start: number; end: number }> {
    const out: Array<{ words: string[]; value?: T; start: number; end: number }> = [];
    let i = 0;

    while (i < words.length) {
      let node: TrieNode<T> | undefined = this.root;
      let best: { end: number; value: T } | undefined;

      for (let j = i; j < words.length && j - i < this.maxLength; j += 1) {
        node = node.children.get(words[j]);
        if (!node) break;
        if (node.value !== undefined) best = { end: j + 1, value: node.value };
      }

      if (best) {
        out.push({ words: words.slice(i, best.end), value: best.value, start: i, end: best.end });
        i = best.end;
      } else {
        out.push({ words: [words[i]], start: i, end: i + 1 });
        i += 1;
      }
    }

    return out;
  }
}
