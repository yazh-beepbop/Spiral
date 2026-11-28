/**
 * English (`en`) translation dictionary for Spiral (`src/lib/i18n/en.ts`).
 *
 * Feature overview & use cases:
 * - Provides all English UI copy, onboarding expectations, microphone permission explanations,
 *   crisis helpline descriptions, IDK redirects, and Career Fog question bank copy (`QIDs 1..29`)
 *   without hardcoding strings inside UI components.
 * - Matches the canonical wording in `Design.md` and `CONSTRAINTS.md`.
 */

import type { TranslationDictionary } from "@/lib/i18n/types";

export const EN_DICTIONARY: TranslationDictionary = {
  meta: {
    brandName: "Spiral",
    promise:
      "A calm, structured clarity guide after the first wave of a turning point — when you're ready to make sense of it.",
    disclaimer:
      "Spiral is a guided reflection tool. It is not therapy, medical advice or a crisis service.",
  },
  settings: {
    buttonLabel: "Language",
    dialogTitle: "Language & voice settings",
    languageLabel: "Choose your language",
    languageHint:
      "Spiral shows menus, asks questions, and writes Bridges in your chosen language.",
    closeButton: "Done",
    savingStatus: "Saving...",
  },
  landing: {
    cadenceTag: "5 days · 10h gap",
    eyebrow: "Clarity guide · Fixed 5-day structure",
    subcopy:
      "Five daily sessions of 15 to 20 minutes, one question at a time, with a ten-hour gap between days. Spiral asks clear questions and reflects your own words back without opinions or advice — then it ends.",
    startCta: "Start your Spiral",
  },
  start: {
    stepLabel: "Before we begin",
    title: "For after the first wave — when you're ready to make sense of it.",
    supportPrefix:
      "Spiral helps you think clearly. If you're overwhelmed right now,",
    supportLinkText: "here's support first.",
    languagePickerLabel: "Language",
    languagePickerHint:
      "Pick the language you want Spiral to ask questions and write your Bridges in.",
    expectation1:
      "Five fixed daily sessions of 15 to 20 minutes — one question at a time, no open-ended chatting, and a clear end.",
    expectation2:
      "Spiral asks neutral questions and reflects back your own words. It never gives opinions, takes sides, or offers advice.",
    expectation3:
      "Each session ends with one Bridge Question and a server-enforced 10-hour gap so you have space to think offline.",
    entryName: "Career Fog",
    entryTag: "5-Day Trunk",
    entryQuote: "“I have options but nothing feels right.”",
    consentText:
      "I am 18 years of age or older, and I understand that Spiral is a guided reflection tool — not therapy, medical advice, or a crisis service.",
    beginDay1: "Begin Day 1",
    openingDay1: "Opening Day 1...",
    loadDemoDay5: "Load Day 5 Demo Journey",
    errStartFailed: "Could not start your Spiral.",
    errConnectFailed:
      "Unable to connect. Check your configuration and try again.",
    errDemoFailed: "Could not load demo journey.",
  },
  session: {
    brandUpper: "SPIRAL",
    openingSession: "Opening today's session...",
    writingBridge: "Sitting with today's answers to write your Bridge...",
    progressAriaLabel: "Session progress",
    rankingHint: "ORDER FROM MOST IMPORTANT (1) TO LEAST (5)",
    moveUpAriaPrefix: "Move up:",
    moveDownAriaPrefix: "Move down:",
    priorityGroupLabelPrefix: "Priority",
    priorityInYourWordsSuffix: "In your words",
    priorityPlaceholderPrefix: "Priority",
    nextStepPlaceholder: "One small next step",
    textareaPlaceholder: "Write honestly, in your own words...",
    continueBtn: "Continue",
    listeningBtn: "Saving...",
    idkExitBtn: "It's fine not to know. We can move on.",
    gentleCheckInIdk: "Take all the time you need here. There is no rush.",
    gentleCheckInNext:
      "Thank you for being honest about how heavy things feel. Go gently on this next one.",
    errBridgeFailed: "Unable to write today's Bridge Question.",
    errBridgeRetry: "Could not generate today's Bridge. Please try again.",
    errLoadSession: "Unable to load your session. Refresh to try again.",
    errSaveAnswer: "Unable to save your answer.",
    errConnectionInterrupted:
      "Connection interrupted. Your progress is safe — try again.",
  },
  voice: {
    micTapToRecord: "Voice input",
    micTapToStop: "Tap to stop",
    micTranscribing: "Transcribing...",
    firstTapExplain:
      "Spiral asks for microphone access only when you tap, to turn your voice into editable text. Audio is deleted right after transcription.",
    permissionDenied:
      "Microphone permission was declined. You can type your answer anytime or allow mic access in browser settings.",
    unsupportedBrowser:
      "Voice recording isn't supported in this browser. Please type your answer below.",
    transcribeFailed:
      "Could not transcribe that recording clearly. Please try again or type your words.",
    emptyTranscript:
      "No clear speech was picked up. Tap the mic to try again, or type your answer.",
    micAriaRecord: "Tap to record voice answer",
    micAriaStop: "Tap to stop recording",
  },
  bridge: {
    loadingBridge: "Loading your Bridge Question...",
    dayBridgeSuffix: "Bridge",
    bridgeFallbackTag: "Bridge",
    eyebrow: "Your Bridge Question",
    fallbackBridgeQuote:
      "Take a quiet evening away from the screen before your next session opens.",
    readFiveDayReflection: "Read your five-day reflection",
    beginNextDayPrefix: "Begin Day",
    continueSpiral: "Continue your Spiral",
    sitWithThisLabel: "Sit with this. Your next session opens in",
  },
  synthesis: {
    day5ReflectionTag: "Day 5 · Reflection",
    day5CompleteTag: "Day 5 · Complete",
    loadingLine1: "Reading across all five days of your words...",
    loadingLine2: "Writing your closing reflection.",
    heading: "What surfaced across your five days",
    tryAgainBtn: "Try again",
    timeoutMessage:
      "Your closing reflection took longer than expected. Your five days of words are safe.",
    threadsAriaLabel: "Threads we noticed",
    threadsSectionLabel: "Threads in your own words · Did these land?",
    acrossDaysPrefix: "Across Days",
    acrossDaysInYourWords: "In your own words",
    didThisLand: "Did this land?",
    yesBtn: "Yes",
    notQuiteBtn: "Not quite",
    noneFitBtn: "None of these fit me",
    noneFitNote:
      "Noted — thank you for being direct. Trust your own read over ours; any reflection that doesn't ring true is meant to be set aside.",
    inYourWordsHeading: "In your words",
    isThisYoursQuestion: "Is this yours, or was it handed to you?",
    closingTitle: "This Spiral ends here",
    closingCopy:
      "There are no streaks to keep and nothing more to unlock today. Step back into your week with what felt true — and if life reaches another turning point years from now, Spiral will remember where you left off.",
    alternativeReadingPrefix: "Or it may simply be that",
    fallbackAlternativeReading:
      "Or it may simply be that this season of life has asked for steady practicality while you decide what comes next.",
  },
  paused: {
    eyebrow: "Session paused with care",
    heading: "Let’s pause here for right now.",
    body: "What you just shared sounds heavy, and you don’t have to sit with it alone. Spiral isn’t equipped to support someone through a moment of crisis — a real person who cares is the right next step.",
    savedNotice: "Your journey is saved. You can come back when you're ready.",
    internationalNote:
      "If you are outside India, contact your local emergency number.",
    resourcesAriaLabel: "Support resources",
    resumeBtn: "Return to my saved journey when ready",
    resumingBtn: "Returning to your Spiral...",
    helplines: {
      teleManas: {
        name: "Tele-MANAS — National Mental Health Helpline (India)",
        availability: "24 hours · Free & confidential · 20+ languages",
        description:
          "Government of India national mental health support line connecting you directly with trained counsellors and mental health professionals.",
        callPrefix: "Call",
      },
      emergency112: {
        name: "National Emergency Response (India)",
        availability: "24 hours · Immediate emergency assistance",
        description:
          "Call 112 from any phone if you are in immediate physical danger or need urgent emergency assistance.",
        callPrefix: "Call",
      },
    },
  },
  idk: {
    thirdPassExitMessage: "It's fine not to know. We can move on.",
    qid27FirstRedirect:
      "Let's make it smaller. Forget the five-year horizon — if you had one quiet Saturday a week to explore one small hunch, what would you spend it on?",
    genericFirstRedirectPrefix:
      "Let's make that smaller. Instead of the whole picture, what is one small, ordinary moment from the past few weeks connected to \"",
    genericFirstRedirectSuffix: "\"?",
    genericSecondRedirect:
      "That's the second time 'I don't know' showed up here. Sometimes a pause sits right next to something hard to put into words — and sometimes the answer genuinely isn't ready yet. Take one unhurried look; if nothing comes up, we can move on cleanly.",
  },
  opener: {
    withBridgeTemplate:
      "Welcome back. Yesterday I left you with this: [Bridge]. Before we start, did anything surface overnight? Even something small.",
    withoutBridge:
      "Welcome back. Before we start today's questions, did anything surface overnight? Even something small.",
  },
  adaptiveFallbacks: {
    11: "When you place your real Tuesday next to the last time you lost track of time, what stands out to you first?",
    16: "Between the moments you said give you energy and the parts that feel like a performance, what do you imagine changes if you stopped performing?",
    23: "Looking at your five-year pride image alongside how last week unfolded, what sits between the two right now?",
  },
  days: {
    1: { title: "Surface Mapping", headerLabel: "DAY 1 · SURFACE MAPPING" },
    2: {
      title: "Energy Archaeology",
      headerLabel: "DAY 2 · ENERGY ARCHAEOLOGY",
    },
    3: {
      title: "Identity Excavation",
      headerLabel: "DAY 3 · IDENTITY EXCAVATION",
    },
    4: {
      title: "Values and Contradictions",
      headerLabel: "DAY 4 · VALUES AND CONTRADICTIONS",
    },
    5: {
      title: "Direction and Asymmetry",
      headerLabel: "DAY 5 · DIRECTION AND ASYMMETRY",
    },
  },
  questions: {
    1: {
      text: "How do you feel about your work right now?",
      choices: ["Energized", "Fine", "Drained", "Numb"],
    },
    2: {
      text: "When was the last time you lost track of time? What were you doing?",
    },
    3: {
      text: "What do people come to you for? Do you enjoy being that person?",
    },
    4: {
      text: "Describe a real Tuesday. Not ideal. Real.",
    },
    5: {
      text: "What would you change if it were easy?",
    },
    6: {
      text: "Welcome back. Yesterday I left you with this: [Bridge]. Before we start, did anything surface overnight? Even something small.",
    },
    7: {
      text: "Think about the last three times you had genuine fun. What were you doing?",
      idkRedirect:
        "Think about last weekend. Was there any moment, even five minutes, where you weren't thinking about work or obligations? What were you doing?",
    },
    8: {
      text: "Two projects: A is structured, B is open-ended. Which one lights you up?",
      choices: ["A is structured", "B is open-ended"],
    },
    9: {
      text: "What counts as fun at work? Be specific.",
    },
    10: {
      text: "What activities outside work make you feel most alive?",
    },
    11: {
      text: "[Adaptive] A follow-up generated from Day 1 answers",
    },
    12: {
      text: "Which world (school, work, social) felt most like you? Which was the biggest performance?",
    },
    13: {
      text: "If you could be honest with everyone for one day, with zero consequences, what would you say, and to whom?",
    },
    14: {
      text: "When you get dressed, are you dressing as who you are, or who you're creating?",
    },
    15: {
      text: "Who would you still talk to if you lived in total isolation? Why them?",
    },
    16: {
      text: "[Adaptive] You said [activity] gives you energy and [role] feels like a performance. What if you stopped performing?",
    },
    17: {
      text: "If nobody could judge you, what would you stop doing tomorrow?",
      idkRedirect:
        "Okay, smaller: what's something you do alone that you'd never post about? Start there.",
    },
    18: {
      text: "When was the last time you felt like yourself?",
      idkRedirect:
        "Let's flip it. When was the last time you definitely did NOT feel like yourself? What was happening?",
    },
    19: {
      text: "Rank these: autonomy, mastery, impact, recognition, belonging.",
      rankingItems: [
        "autonomy",
        "mastery",
        "impact",
        "recognition",
        "belonging",
      ],
    },
    20: {
      text: "Look at how you spent last week. Does it match your ranking?",
    },
    21: {
      text: "Imagine being privately, quietly proud five years from now. First image. Don't think.",
    },
    22: {
      text: "Does prestige feel good, or just useful?",
    },
    23: {
      text: "[Adaptive] Your pride image was [X], but your trajectory points toward [Y]. What drives the gap?",
    },
    24: {
      text: "What would you do for free that people would eventually pay for?",
    },
    25: {
      text: "What's the one move with low downside and huge upside that you've been avoiding?",
    },
    26: {
      text: "Describe your ideal Monday morning. First three hours. Specific.",
    },
    27: {
      text: "What would you bet on? Not the safe bet. The real one.",
      idkRedirect:
        "That's the second time you've said that. What's the answer you're afraid is too small, too weird, or too unrealistic to say out loud?",
    },
    28: {
      text: "What's the one thing you know you need to do but haven't done yet?",
      idkRedirect:
        "You do know. You've known for a while. The thing that flashed in your mind before you typed 'no idea'. That one. Say it.",
    },
    29: {
      text: "In your own words, name your top 3 priorities right now, and one small next step for each.",
    },
  },
};
