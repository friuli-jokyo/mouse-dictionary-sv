/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import decoy from "./decoy";
import dom from "./dom";
import ponyfill from "./ponyfill/ponyfill";

const build = (doConfirmValidCharacter, maxWords) => {
  const traverser = new Traverser(doConfirmValidCharacter, maxWords);

  const getTextUnderCursor = (element, clientX, clientY) => {
    let textOnCursor;
    try {
      textOnCursor = traverser.fetchTextUnderCursor(element, clientX, clientY);
    } catch (err) {
      console.error(err);
    }
    return textOnCursor ?? [];
  };

  return getTextUnderCursor;
};

class Traverser {
  constructor(doGetTargetCharacterType, maxWords) {
    this.JA_MAX_LENGTH = 40;
    this.getTargetCharacterType = doGetTargetCharacterType ?? ((code) => (isLatin1Character(code) ? 3 : 0));
    this.maxWords = maxWords ?? 8;
    this.decoy = decoy.create("div");
  }

  fetchTextUnderCursor(element, clientX, clientY) {
    const range = ponyfill.getCaretNodeAndOffsetFromPoint(element.ownerDocument, clientX, clientY);
    if (!range) {
      return [];
    }
    const { node, offset } = range;

    if (node.nodeType === Node.TEXT_NODE) {
      return this.fetchTextFromTextNode(node, offset);
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      return this.fetchTextFromElementNode(element, clientX, clientY);
    }

    return [];
  }

  fetchTextFromTextNode(textNode, offset) {
    const { text, subText, end, isLatin1: isLatin1 } = this.getTextFromRange(textNode.data, offset);
    const textList = subText ? [text, subText] : [text];
    if (!end) {
      return textList;
    }
    const followingText = dom.traverse(textNode);
    return textList.map((t) => this.concatenate(t, followingText, isLatin1));
  }

  concatenate(text, followingText, isLatin1) {
    const concatenatedText = concatenateFollowingText(text, followingText, isLatin1);
    const endIndex = isLatin1
      ? searchEndIndex(concatenatedText, 0, this.maxWords, this.getTargetCharacterType)
      : this.JA_MAX_LENGTH;
    return concatenatedText.substring(0, endIndex);
  }

  fetchTextFromElementNode(element, clientX, clientY) {
    try {
      this.decoy.activate(element);

      const range = ponyfill.getCaretNodeAndOffsetFromPoint(element.ownerDocument, clientX, clientY);
      if (!range) {
        return;
      }
      const { node, offset } = range;

      if (node.nodeType === Node.TEXT_NODE) {
        return this.fetchTextFromTextNode(node, offset, this.maxWords);
      }
    } finally {
      this.decoy.deactivate();
    }
  }

  getTextFromRange(sourceText, offset) {
    if (!sourceText) {
      return {};
    }
    const code = sourceText.charCodeAt(offset);
    const isLatin1 = isLatin1Character(code);

    if (isLatin1) {
      const startIndex = searchStartIndex(sourceText, offset, this.getTargetCharacterType);
      const endIndex = searchEndIndex(sourceText, offset, this.maxWords, this.getTargetCharacterType);
      const text = sourceText.substring(startIndex, endIndex);
      const end = endIndex >= sourceText.length;
      return { text, undefined, end, isLatin1: isLatin1 };
    }

    const startIndex = offset;
    const endIndex = offset + this.JA_MAX_LENGTH;
    const properStartIndex = retrieveProperStartIndex(sourceText, startIndex + 1);
    const text = sourceText.substring(properStartIndex, endIndex);

    const subText = startIndex !== properStartIndex ? sourceText.substring(startIndex, endIndex) : undefined;
    const end = endIndex >= sourceText.length;
    return { text, subText, end, isLatin1: isLatin1 };
  }
}

const retrieveProperStartIndex = (sourceText, cursorIndex) => {
  let currentLength = 0;
  const tokens = tokenize(sourceText, "ja-JP");
  if (!tokens) {
    return cursorIndex;
  }
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (cursorIndex <= currentLength + token.length) {
      return currentLength;
    }
    currentLength += token.length;
  }
  return 0;
};

const searchStartIndex = (text, index, doGetCharacterType) => {
  let startIndex;
  let i = index;
  for (;;) {
    const code = text.charCodeAt(i);
    const toPursue = doGetCharacterType(code) & 1;
    if (!toPursue) {
      startIndex = i + 1;
      break;
    }
    if (i <= 0) {
      startIndex = 0;
      break;
    }
    i -= 1;
  }
  return startIndex;
};

const searchEndIndex = (text, index, maxWords, doGetCharacterType) => {
  let endIndex;
  let i = index + 1;
  let spaceCount = 0;
  let theLastIsSpace = false;
  for (;;) {
    const code = text.charCodeAt(i);
    if (code === 0x20) {
      if (!theLastIsSpace) {
        spaceCount += 1;
      }
      theLastIsSpace = true;
      if (spaceCount >= maxWords) {
        endIndex = i;
        break;
      }
    } else {
      const toPursue = doGetCharacterType(code) & 2;
      if (!toPursue) {
        endIndex = i;
        break;
      }
      theLastIsSpace = false;
    }
    if (i >= text.length) {
      endIndex = i;
      break;
    }

    i += 1;
  }
  return endIndex;
};

const concatenateFollowingText = (text, followingText, isLatin1) => {
  if (!followingText) {
    return text;
  }
  if (!isLatin1) {
    return text + followingText;
  }
  if (followingText.startsWith("-")) {
    return text + followingText;
  }
  return text + " " + followingText;
};

const isLatin1Character = (code) => (0x20 <= code && code <= 0x7e) || (0xa0 <= code && code <= 0xff);

// Intl.v8BreakIterator will be replaced with Intl.Segmenter in the future.
// https://github.com/tc39/proposal-intl-segmenter
const tokenize = (text, lang) => {
  if (!Intl?.v8BreakIterator) {
    return null;
  }
  const it = Intl.v8BreakIterator([lang], { type: "word" });
  it.adoptText(text);

  let cur = 0;

  const words = [];
  while (cur < text.length) {
    const prev = cur;
    cur = it.next();
    words.push(text.substring(prev, cur));
  }
  return words;
};

export default { build };
