/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import entry from "../entry";
import entryGeneratorEn from "./en";
import entryGeneratorJa from "./ja";
import entryGeneratorSv from "./sv";

// Can add other languages here
const generators = {
  en: entryGeneratorEn,
  ja: entryGeneratorJa,
  sv: entryGeneratorSv,
  default: entryGeneratorEn,
};

const languageDetector = (text) => {
  if (isSvenskaText(text)) {
    console.log("sv", text);
    return "sv";
  }
  if (isEnglishText(text)) {
    console.log("en", text);
    return "en";
  }
  console.log("ja", text);
  return "ja";
};

const isEnglishText = (str) => {
  let result = true;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const isEnglishLike = (0x20 <= code && code <= 0x7e) || code === 0x2011 || code === 0x200c;
    if (!isEnglishLike) {
      result = false;
      break;
    }
  }
  return result;
};

const isSvenskaText = (str) => {
  let result = true;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const isSvenskaLike =
      (0x20 <= code && code <= 0x7e) ||
      code === 0xc4 || // Ä
      code === 0xc5 || // Å
      code === 0xc9 || // É
      code === 0xd6 || // Ö
      code === 0xe4 || // ä
      code === 0xe5 || // å
      code === 0xe9 || // é
      code === 0xf6 || // ö
      code === 0x2011 ||
      code === 0x200c;
    if (!isSvenskaLike) {
      result = false;
      break;
    }
  }
  return result;
};

const build = () => {
  return entry.build(languageDetector, generators);
};

export default build;
