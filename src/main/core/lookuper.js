/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import dom from "../lib/dom";
import ShortCache from "../lib/shortcache";
import storage from "../lib/storage";
import text from "../lib/text";
import utils from "../lib/utils";
import Generator from "./generator";

const TEXT_LENGTH_LIMIT = 128;

export default class Lookuper {
  constructor(settings, doBuildEntry, doUpdateContent) {
    this.lookupWithCapitalized = settings.lookupWithCapitalized;
    this.doUpdateContent = doUpdateContent;
    this.doBuildEntry = doBuildEntry;

    this.lastText = null;
    this.aimed = false;
    this.suspended = false;
    this.halfLocked = false;
    this.textLengthLimit = TEXT_LENGTH_LIMIT;
    this.counter = 0;

    // Compile templates, regular expressions so that it works fast
    this.generator = new Generator(settings);
    const cacheSize = process.env.NODE_ENV === "production" ? 100 : 0;
    this.shortCache = new ShortCache(cacheSize);
  }

  #canUpdate() {
    if (this.suspended) {
      return false;
    }
    if (this.halfLocked && this.aimed) {
      return false;
    }
    if (!this.halfLocked && utils.getSelection()) {
      return false;
    }
    return true;
  }

  async lookup(text) {
    return this.lookupAll([text]);
  }

  async lookupAll(textList) {
    if (!this.#canUpdate()) {
      return false;
    }
    return await this.#updateAll(textList, this.lookupWithCapitalized, false, true, 0);
  }

  async aimedLookup(text) {
    if (!text) {
      this.aimed = false;
      return false;
    }
    if (this.lastText === text) {
      return false;
    }
    this.aimed = true;
    return await this.update(text, true, true, false, 1);
  }

  async update(text, withCapitalized, includeOriginalText, enableShortWord, threshold = 0) {
    if (!text) {
      return false;
    }
    return await this.#updateAll([text], withCapitalized, includeOriginalText, enableShortWord, threshold);
  }

  async #updateAll(textList, withCapitalized, includeOriginalText, enableShortWord, threshold = 0) {
    const { content, hit } = await this.#createContent(textList, withCapitalized, includeOriginalText, enableShortWord);

    if (hit >= threshold) {
      this.doUpdateContent(content, hit);
      return true;
    }
    return false;
  }

  async #createContent(sourceTextList, withCapitalized, includeOriginalText, enableShortWord) {
    const textList = [];
    for (let i = 0; i < sourceTextList.length; i++) {
      const text = sourceTextList[i].substring(0, this.textLengthLimit);
      if (text) {
        textList.push(text);
      }
    }
    const cacheKey = textList.join("\u0001");

    if (!includeOriginalText) {
      if (this.lastText === cacheKey) {
        return {};
      }
      const cacheData = this.shortCache.get(cacheKey);
      if (cacheData) {
        this.doUpdateContent(cacheData.dom, cacheData.hitCount);
        this.lastText = cacheKey;
        return {};
      }
    }
    const counter = ++this.counter;
    DEBUG && console.time(`lookup-${counter}`);
    const { html, hit } = await this.runAll(textList, withCapitalized, includeOriginalText, enableShortWord);
    const content = dom.create(html);

    this.lastText = cacheKey;
    DEBUG && console.timeEnd(`lookup-${counter}`);

    return { content, hit };
  }

  async run(textToLookup, withCapitalized, includeOrgText, enableShortWord) {
    return this.runAll([textToLookup], withCapitalized, includeOrgText, enableShortWord);
  }

  async runAll(textList, withCapitalized, includeOrgText, enableShortWord) {
    const allEntries = [];
    const langs = [];
    for (let i = 0; i < textList.length; i++) {
      const text = textList[i];
      const { entries, lang } = this.doBuildEntry(text, withCapitalized, includeOrgText);
      DEBUG && console.info(`${entries.join(",")}`);
      DEBUG && console.info(`${entries.length}`);

      allEntries.push(...entries);
      langs.push(lang);
    }
    const { heads, descriptions } = await fetchDescriptions(allEntries);
    const { html, hitCount } = this.generator.generate(heads, descriptions, enableShortWord && langs[0] === "en");
    return { html, hit: hitCount };
  }
}

const fetchDescriptions = async (entries) => {
  const primaryDescriptions = await storage.local.get(entries);
  const primaryHeads = entries.filter((e) => primaryDescriptions[e]);

  const refHeads = extractRefPatterns(primaryDescriptions);
  if (refHeads.length === 0) {
    return { heads: primaryHeads, descriptions: primaryDescriptions };
  }

  const refDescriptions = await storage.local.get(refHeads);
  const heads = [...primaryHeads, ...refHeads];
  const descriptions = { ...primaryDescriptions, ...refDescriptions };
  return { heads, descriptions };
};

const extractRefPatterns = (descriptions) => {
  const resultSet = new Set();
  const existingKeys = new Set(Object.keys(descriptions));
  const descList = Object.values(descriptions);

  for (let i = 0; i < descList.length; i++) {
    const refList = text.extractRefPatternsInText(descList[i]);
    for (const ref of refList) {
      if (existingKeys.has(ref)) {
        continue;
      }
      resultSet.add(ref);
    }
  }
  return Array.from(resultSet);
};
