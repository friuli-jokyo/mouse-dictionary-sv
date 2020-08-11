/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import res from "./resource";
import rule from "./rule";
import view from "./view";
import config from "./config";
import events from "./events";
import dom from "../lib/dom";
import utils from "../lib/utils";
import ribbon from "../lib/ribbon";

const main = async () => {
  console.time("launch");
  await invoke();
  console.timeEnd("launch");
};

const invoke = async () => {
  const existingElement = document.getElementById(DIALOG_ID);
  if (!existingElement) {
    await processFirstLaunch();
  } else {
    await processSecondOrLaterLaunch(existingElement);
  }
};

const processFirstLaunch = async () => {
  if (isFramePage()) {
    // Doesn't support frame pages
    alert(res("doesntSupportFrame"));
    return;
  }

  const { settings, position } = await config.loadAll();

  if (onPdfDocument(location.href, settings.pdfUrlPattern)) {
    const toContinue = settings.skipPdfConfirmation || confirm(res("continueProcessingPdf"));
    if (!toContinue) {
      return;
    }
    try {
      invokePdfReader();
    } catch (e) {
      alert(e.message);
      console.error(e);
    }
    return;
  }

  try {
    initialize(settings, position);
  } catch (e) {
    alert(e.message);
    console.error(e);
    return;
  }

  // Lazy load
  rule.load();
};

const onPdfDocument = (url, pdfUrlPattern) => {
  if (!pdfUrlPattern) {
    return false;
  }
  try {
    const re = new RegExp(pdfUrlPattern);
    return re.test(url);
  } catch (error) {
    console.error(error);
  }
  return false;
};

const processSecondOrLaterLaunch = async (existingElement) => {
  const userSettings = await config.loadSettings();
  toggleDialog(existingElement, userSettings);
};

const isFramePage = () => {
  const frames = document.getElementsByTagName("frame");
  return frames?.length >= 1;
};

const toggleDialog = (area, userSettings) => {
  const isHidden = area.getAttribute("data-mouse-dictionary-hidden");
  if (isHidden === "true") {
    dom.applyStyles(area, userSettings.normalDialogStyles);
    area.setAttribute("data-mouse-dictionary-hidden", "false");
  } else {
    dom.applyStyles(area, userSettings.hiddenDialogStyles);
    area.setAttribute("data-mouse-dictionary-hidden", "true");
  }
};

const initialize = (userSettings, storedPosition) => {
  const area = view.create(userSettings);
  area.dialog.id = DIALOG_ID;
  dom.applyStyles(area.dialog, userSettings.hiddenDialogStyles);
  document.body.appendChild(area.dialog);

  const newStyles = decideInitialStyles(userSettings, storedPosition, area.dialog.clientWidth);
  dom.applyStyles(area.dialog, newStyles);

  // Async
  setEvents(area, userSettings);
};

const decideInitialStyles = (userSettings, storedPosition, dialogWidth) => {
  let newPosition;
  if (userSettings.initialPosition === "keep") {
    newPosition = utils.optimizeInitialPosition(storedPosition);
  } else {
    newPosition = getInitialPosition(userSettings.initialPosition, dialogWidth);
  }
  const positionStyles = utils.convertToStyles(newPosition);
  const newStyles = Object.assign(positionStyles, userSettings.normalDialogStyles);
  return newStyles;
};

const setEvents = async (area, userSettings) => {
  let doUpdate = (newDom) => dom.replace(area.content, newDom);

  events.attach(userSettings, area.dialog, (newDom) => doUpdate(newDom));

  const isDataReady = await config.isDataReady();
  if (isDataReady) {
    return;
  }
  // Notice for the very first launch.
  const notice = dom.create(`<span>${res("needToPrepareDict")}</span>`);
  dom.replace(area.content, notice);
  doUpdate = async () => {
    if (!(await config.isDataReady())) {
      return;
    }
    doUpdate = (newDom) => dom.replace(area.content, newDom);
  };
};

const EDGE_SPACE = 5;

const getInitialPosition = (type, dialogWidth) => {
  const position = {};
  switch (type) {
    case "right":
      position.left = document.documentElement.clientWidth - dialogWidth - EDGE_SPACE;
      break;
    case "left":
      position.left = EDGE_SPACE;
      break;
  }
  return position;
};

const invokePdfReader = async () => {
  const [updateRibbon, closeRibbon] = ribbon.create();

  updateRibbon(res("downloadingPdf"));

  const r = await fetch(location.href);

  if (r.status !== 200) {
    updateRibbon(await r.text(), [""]);
    return;
  }

  updateRibbon(res("preparingPdf"));

  const arrayBuffer = await r.arrayBuffer();

  if (!isPdf(arrayBuffer)) {
    updateRibbon(res("nonPdf"), [""]);
    return;
  }

  const payload = convertToBase64(arrayBuffer);
  sendMessage({ type: "open_pdf", payload });

  closeRibbon();
};

const isPdf = (arrayBuffer) => {
  const first4 = new Uint8Array(arrayBuffer.slice(0, 4));
  return first4[0] === 37 && first4[1] === 80 && first4[2] === 68 && first4[3] === 70;
};

const convertToBase64 = (arrayBuffer) => {
  let result = "";
  const byteArray = new Uint8Array(arrayBuffer);

  for (let i = 0; ; i++) {
    if (i * 1023 >= byteArray.length) {
      break;
    }
    const start = i * 1023;
    const end = (i + 1) * 1023;

    const slice = byteArray.slice(start, end);
    const base64slice = btoa(String.fromCharCode(...slice));

    result += base64slice;
  }
  return result;
};

const sendMessage = async (message) => {
  return new Promise((done) => {
    chrome.runtime.sendMessage(message, (response) => {
      done(response);
    });
  });
};

main();