/**
 * Hinglish (`hinglish`) translation dictionary for Spiral (`src/lib/i18n/hinglish.ts`).
 *
 * Feature overview & use cases:
 * - Natural, everyday Roman-script Hindi-English as spoken by people in their 20s and 30s
 *   across urban India.
 * - Preserves Spiral's calm, plain-spoken, unbiased clarity-guide voice with zero therapy
 *   jargon, zero advice, and clear crisis helpline instructions.
 */

import type { TranslationDictionary } from "@/lib/i18n/types";

export const HINGLISH_DICTIONARY: TranslationDictionary = {
  meta: {
    brandName: "Spiral",
    promise:
      "Zindagi ke kisi turning point ki pehli lehar ke baad ek shant, structured clarity guide — jab aap cheezon ko samajhne ke liye taiyaar hon.",
    disclaimer:
      "Spiral ek guided reflection tool hai. Yeh therapy, medical advice ya crisis service nahi hai.",
  },
  settings: {
    buttonLabel: "Bhasha",
    dialogTitle: "Language aur voice settings",
    languageLabel: "Apni language chuniye",
    languageHint:
      "Spiral saare menus, sawaal aur daily Bridge Questions aapki chuni hui language mein dikhayega.",
    closeButton: "Theek hai",
    savingStatus: "Save ho raha hai...",
  },
  landing: {
    cadenceTag: "5 din · 10h gap",
    eyebrow: "Clarity guide · Fixed 5-day structure",
    subcopy:
      "Roz 15 se 20 minute ke paanch sessions — ek waqt par ek sawaal, aur har din ke beech 10 ghante ka gap. Spiral seedhe sawaal poochta hai aur bina kisi opinion ya salah ke aapke apne shabd aapko wapas dikhata hai — aur phir khatam ho jaata hai.",
    startCta: "Apna Spiral shuru karein",
  },
  start: {
    stepLabel: "Shuru karne se pehle",
    title:
      "Pehli lehar guzarne ke baad ke liye — jab aap thande dimaag se sochne ko taiyaar hon.",
    supportPrefix:
      "Spiral aapko saaf sochne mein madad karta hai. Agar abhi sab kuch bahut bhaari lag raha hai, toh",
    supportLinkText: "pehle yahan support lein.",
    languagePickerLabel: "Language chuniye",
    languagePickerHint:
      "Jis language mein aap sawaal aur Bridge Questions padhna chahte hain, woh chuniye.",
    expectation1:
      "15 se 20 minute ke paanch fixed daily sessions — ek baar mein ek sawaal, koi open-ended chatting nahi, aur ek saaf end.",
    expectation2:
      "Spiral neutral sawaal poochta hai aur aapki hi baatein saaf aaine ki tarah wapas rakhta hai. Yeh kabhi opinion, side ya advice nahi deta.",
    expectation3:
      "Har session ek Bridge Question aur server-enforced 10 ghante ke gap ke saath rukta hai, taaki screen se hatkar sochne ki jagah mile.",
    entryName: "Career Fog",
    entryTag: "5-Day Trunk",
    entryQuote: "“Options toh hain, par kuch bhi sahi nahi lag raha.”",
    consentText:
      "Meri umar 18 saal ya usse zyada hai, aur main samajhta/samajhti hoon ki Spiral ek guided reflection tool hai — therapy, medical advice ya crisis service nahi.",
    beginDay1: "Day 1 shuru karein",
    openingDay1: "Day 1 khul raha hai...",
    loadDemoDay5: "Day 5 Demo Journey load karein",
    errStartFailed: "Abhi Spiral shuru nahi ho paya.",
    errConnectFailed:
      "Connect nahi ho pa raha hai. Ek baar check karke dobara try karein.",
    errDemoFailed: "Demo journey load nahi ho payi.",
  },
  session: {
    brandUpper: "SPIRAL",
    openingSession: "Aaj ka session khul raha hai...",
    writingBridge: "Aaj ke jawabon ke saath baithkar aapka Bridge likha ja raha hai...",
    progressAriaLabel: "Session progress",
    rankingHint: "SABSE ZAROORI (1) SE SABSE KAM (5) TAK ORDER KAREIN",
    moveUpAriaPrefix: "Upar le jaayein:",
    moveDownAriaPrefix: "Neeche le jaayein:",
    priorityGroupLabelPrefix: "Priority",
    priorityInYourWordsSuffix: "Aapke shabdon mein",
    priorityPlaceholderPrefix: "Priority",
    nextStepPlaceholder: "Ek chhota agla kadam",
    textareaPlaceholder: "Imaandaari se, apne shabdon mein likhein...",
    continueBtn: "Aage badhein",
    listeningBtn: "Save ho raha hai...",
    idkExitBtn: "Nahi pata hona bilkul theek hai. Hum aage badh sakte hain.",
    gentleCheckInIdk: "Aaram se samay lein. Koi jaldi nahi hai.",
    gentleCheckInNext:
      "Jo bhaari lag raha hai use imaandaari se kehne ke liye shukriya. Agle sawaal par aaram se chalein.",
    errBridgeFailed: "Aaj ka Bridge Question abhi nahi ban paya.",
    errBridgeRetry: "Aaj ka Bridge nahi ban paya. Ek baar phir try karein.",
    errLoadSession: "Session load nahi ho paya. Refresh karke dobara dekhein.",
    errSaveAnswer: "Aapka jawab save nahi ho paya.",
    errConnectionInterrupted:
      "Connection beech mein ruk gaya. Aapki progress safe hai — dobara try karein.",
  },
  voice: {
    micTapToRecord: "Bolkar likhein",
    micTapToStop: "Rokne ke liye tap karein",
    micTranscribing: "Shabdon mein badla ja raha hai...",
    firstTapExplain:
      "Spiral mic ki permission sirf pehle tap par maangta hai taaki aapki aawaaz ko editable text mein badal sake. Transcription ke turant baad audio delete kar diya jaata hai.",
    permissionDenied:
      "Mic permission allow nahi hui. Aap kabhi bhi type kar sakte hain ya browser settings mein mic allow kar sakte hain.",
    unsupportedBrowser:
      "Is browser mein voice recording available nahi hai. Kripya neeche apna jawab type karein.",
    transcribeFailed:
      "Recording saaf transcribe nahi ho payi. Dobara bolkar dekhein ya type kar lein.",
    emptyTranscript:
      "Koi saaf aawaaz sunai nahi di. Dobara try karne ke liye mic tap karein ya jawab type karein.",
    micAriaRecord: "Aawaaz mein jawab record karne ke liye tap karein",
    micAriaStop: "Recording rokne ke liye tap karein",
  },
  bridge: {
    loadingBridge: "Aapka Bridge Question load ho raha hai...",
    dayBridgeSuffix: "Bridge",
    bridgeFallbackTag: "Bridge",
    eyebrow: "Aapka Bridge Question",
    fallbackBridgeQuote:
      "Agla session khulne se pehle screen se door ek shant shaam bitayein.",
    readFiveDayReflection: "Apna paanch-din ka reflection padhein",
    beginNextDayPrefix: "Shuru karein Day",
    continueSpiral: "Apna Spiral aage badhayein",
    sitWithThisLabel: "Is sawaal ke saath thoda rukiye. Agla session khulega",
  },
  synthesis: {
    day5ReflectionTag: "Day 5 · Reflection",
    day5CompleteTag: "Day 5 · Poora hua",
    loadingLine1: "Paanchon din ke aapke shabdon ko ek saath padha ja raha hai...",
    loadingLine2: "Aapka closing reflection likha ja raha hai.",
    heading: "Aapke paanch dinon mein kya saamne aaya",
    tryAgainBtn: "Dobara try karein",
    timeoutMessage:
      "Closing reflection banne mein umeed se zyada samay lag gaya. Aapke paanchon din ke jawab bilkul safe hain.",
    threadsAriaLabel: "Jo threads dikhe",
    threadsSectionLabel: "Aapke hi shabdon ke threads · Kya yeh sahi baitha?",
    acrossDaysPrefix: "Days",
    acrossDaysInYourWords: "Aapke apne shabdon mein",
    didThisLand: "Kya yeh baat sahi lagi?",
    yesBtn: "Haan",
    notQuiteBtn: "Poori tarah nahi",
    noneFitBtn: "Inmein se koi bhi mujh par fit nahi baith-ta",
    noneFitNote:
      "Note kar liya — seedha batane ke liye shukriya. Humari samajh se zyada apne khud ke ehsaas par bharosa rakhein; jo baat sahi na lage use side mein rakh dena hi theek hai.",
    inYourWordsHeading: "In your words · Aapke shabdon mein",
    isThisYoursQuestion: "Kya yeh waqai aapka apna hai, ya kisi aur se mila hua?",
    closingTitle: "Yeh Spiral yahin poora hota hai",
    closingCopy:
      "Yahan koi streak nahi rakhni hai aur aaj kuch aur unlock nahi karna hai. Jo sach laga use lekar apne hafte mein wapas jaayein — aur saalon baad agar zindagi phir kisi mod par khadi ho, Spiral ko yaad rahega aapne kahan chhoda tha.",
    alternativeReadingPrefix: "Ya shayad baat bas itni si ho ki",
    fallbackAlternativeReading:
      "Ya shayad baat bas itni si ho ki zindagi ke is daur mein agla kadam tay karne tak aapne practical rehna chuna hai.",
  },
  paused: {
    eyebrow: "Session aaram se roka gaya hai",
    heading: "Abhi ke liye yahin thoda rukte hain.",
    body: "Aapne jo abhi baanta woh kaafi bhaari lag raha hai, aur iske saath aapko akele baithne ki zaroorat nahi hai. Crisis ke pal mein kisi ko sambhalne ke liye Spiral nahi bana hai — ek asli insaan jo parwah karta ho aur sun sake, wahi abhi sabse sahi agla kadam hai.",
    savedNotice:
      "Aapki journey safe hai. Jab bhi aap taiyaar mehsoos karein, wapas aa sakte hain.",
    internationalNote:
      "Agar aap India se baahar hain, toh apne local emergency helpline number par sampark karein.",
    resourcesAriaLabel: "Support aur helpline numbers",
    resumeBtn: "Taiyaar hone par apni saved journey par wapas jaayein",
    resumingBtn: "Aapke Spiral par wapas ja rahe hain...",
    helplines: {
      teleManas: {
        name: "Tele-MANAS — National Mental Health Helpline (India)",
        availability: "24 ghante · Muft aur gopniya · 20+ Indian languages",
        description:
          "Bharat Sarkar ki national mental health helpline jahan aap seedhe trained counsellors aur mental health professionals se baat kar sakte hain.",
        callPrefix: "Call karein",
      },
      emergency112: {
        name: "National Emergency Response (India)",
        availability: "24 ghante · Turant emergency madad",
        description:
          "Agar aap kisi bhi tarah ke turant khatre mein hain ya foran emergency madad chahiye, toh kisi bhi phone se 112 par call karein.",
        callPrefix: "Call karein",
      },
    },
  },
  idk: {
    thirdPassExitMessage:
      "Nahi pata hona bilkul theek hai. Hum aage badh sakte hain.",
    qid27FirstRedirect:
      "Chaliye ise chhota karte hain. Paanch saal bhool jaayein — agar har hafte ek shant Saturday sirf kisi ek chhote hunch ko try karne ke liye mile, toh aap usmein kya karenge?",
    genericFirstRedirectPrefix:
      "Chaliye ise thoda chhota karte hain. Poori tasveer chhodkar, pichhle kuch hafton ka koi ek chhota, aam sa pal batayein jo is sawaal se juda ho: \"",
    genericFirstRedirectSuffix: "\"?",
    genericSecondRedirect:
      "Yahan doosri baar 'pata nahi' aaya hai. Kabhi-kabhi rukawat kisi aisi baat ke paas hoti hai jise shabdon mein laana mushkil ho — aur kabhi-kabhi jawab sach mein abhi taiyaar nahi hota. Ek baar bina jaldi ke dekhein; agar kuch na aaye toh hum aaram se aage badh sakte hain.",
  },
  opener: {
    withBridgeTemplate:
      "Wapas aane par swagat hai. Kal maine aapko is sawaal ke saath chhoda tha: [Bridge]. Shuru karne se pehle — kya raat bhar mein koi khayal aaya? Chaahe kitna hi chhota kyun na ho.",
    withoutBridge:
      "Wapas aane par swagat hai. Aaj ke sawaal shuru karne se pehle — kya raat bhar mein koi baat dhyan mein aayi? Chaahe chhoti si hi sahi.",
  },
  adaptiveFallbacks: {
    11: "Jab aap apne asli Tuesday ko us aakhri pal ke bagal mein rakhte hain jab aapko waqt ka hosh nahi raha tha, toh sabse pehle kya farq dikhta hai?",
    16: "Jin palon se aapko energy milti hai aur jo hisse ek performance jaise lagte hain — agar aap woh performance rok dein toh aapke hisaab se kya badlega?",
    23: "Paanch saal baad wali apni quiet pride ki tasveer aur pichhle hafte ke asli schedule ke beech abhi kya khada dikhta hai?",
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
      title: "Values aur Contradictions",
      headerLabel: "DAY 4 · VALUES AUR CONTRADICTIONS",
    },
    5: {
      title: "Direction aur Asymmetry",
      headerLabel: "DAY 5 · DIRECTION AUR ASYMMETRY",
    },
  },
  questions: {
    1: {
      text: "Apne kaam ko lekar abhi aap kaisa mehsoos kar rahe hain?",
      choices: ["Energized", "Theek-thaak (Fine)", "Drained (Thaka hua)", "Numb (Sunn)"],
    },
    2: {
      text: "Aakhri baar kab aisa hua tha ki kaam ya kisi cheez mein waqt ka pata hi nahi chala? Aap kya kar rahe the?",
    },
    3: {
      text: "Log kis kaam ya madad ke liye aapke paas aate hain? Kya aapko woh insaan banna achha lagta hai?",
    },
    4: {
      text: "Apna ek asli Tuesday describe karein. Ideal nahi — jaisa sach mein guzarta hai.",
    },
    5: {
      text: "Agar badalna aasaan hota, toh aap kya badalte?",
    },
    6: {
      text: "Wapas aane par swagat hai. Kal maine aapko is sawaal ke saath chhoda tha: [Bridge]. Shuru karne se pehle — kya raat bhar mein koi khayal aaya? Chaahe kitna hi chhota kyun na ho.",
    },
    7: {
      text: "Pichhli teen baar jab aapko sach mein dil se maza aaya tha, unke baare mein sochein. Aap kya kar rahe the?",
      idkRedirect:
        "Pichhle weekend ke baare mein sochein. Kya paanch minute ka bhi koi aisa pal tha jab dimaag mein kaam ya zimmedaariyan nahi chal rahi thin? Tab aap kya kar rahe the?",
    },
    8: {
      text: "Do projects hain: A structured hai, B open-ended hai. Kaunsa aapko andar se excite karta hai?",
      choices: ["A structured hai", "B open-ended hai"],
    },
    9: {
      text: "Kaam ke dauran aapke liye 'fun' kis cheez ko kehte hain? Specific batayein.",
    },
    10: {
      text: "Kaam ke baahar kaunsi activities aapko sabse zyada zinda mehsoos karati hain?",
    },
    11: {
      text: "[Adaptive] Day 1 ke jawabon se nikla ek follow-up sawaal",
    },
    12: {
      text: "Kaunsi duniya (school, kaam, social circle) sabse zyada aapke jaisi lagi? Aur kahan sabse badi acting ya performance lagi?",
    },
    13: {
      text: "Agar ek din ke liye bina kisi anjaam ke aap sabse poora sach bol paate, toh kis-se kya kehte?",
    },
    14: {
      text: "Roz taiyaar hote waqt, kya aap woh pehente hain jo aap hain — ya woh jo aap dikhana chahte hain?",
    },
    15: {
      text: "Agar aap sabse door bilkul akele reh rahe hote, tab bhi kin logon se baat karte? Unhi se kyun?",
    },
    16: {
      text: "[Adaptive] Aapne kaha [activity] se energy milti hai aur [role] performance jaisa lagta hai. Agar aap perform karna band kar dein toh kya hoga?",
    },
    17: {
      text: "Agar koi aapko judge na kar sake, toh kal se hi aap kaunsa kaam karna band kar denge?",
      idkRedirect:
        "Achha, thoda chhota sawaal: aisi kaunsi cheez hai jo aap akele mein karte hain par kabhi social media par post nahi karenge? Wahan se shuru karein.",
    },
    18: {
      text: "Aakhri baar kab aapko laga tha ki aap bilkul khud jaise hain?",
      idkRedirect:
        "Chaliye ulta karke dekhte hain. Aakhri baar kab aapko saaf laga tha ki aap bilkul bhi khud jaise NAHI lag rahe? Tab kya ho raha tha?",
    },
    19: {
      text: "Inhein apne hisaab se rank karein: autonomy (azaadi), mastery (maharat), impact (asar), recognition (pehchaan), belonging (apnapan).",
      rankingItems: [
        "autonomy (azaadi)",
        "mastery (maharat)",
        "impact (asar)",
        "recognition (pehchaan)",
        "belonging (apnapan)",
      ],
    },
    20: {
      text: "Pichhla hafta aapne jaise bitaya, us par nazar daalein. Kya woh aapki is ranking se match karta hai?",
    },
    21: {
      text: "Aaj se paanch saal baad mann hi mann shant garv (quiet pride) mehsoos karne ki kalpana karein. Sabse pehli tasveer kya aayi? Zyada mat sochein.",
    },
    22: {
      text: "Kya prestige andar se achha mehsoos karata hai, ya bas kaam nikalne ke liye useful lagta hai?",
    },
    23: {
      text: "[Adaptive] Aapki pride image [X] thi, par abhi ka rasta [Y] ki taraf ja raha hai. Is gap ke peechhe kya hai?",
    },
    24: {
      text: "Aisa kaunsa kaam hai jo aap muft mein bhi khushi se karenge, aur aage chalkar log uske paise bhi denge?",
    },
    25: {
      text: "Aisa kaunsa ek kadam hai jismein nuksaan bahut kam aur fayda bahut bada ho sakta hai, par aap use taal rahe hain?",
    },
    26: {
      text: "Apni ideal Monday morning describe karein. Shuru ke teen ghante. Bilkul specific.",
    },
    27: {
      text: "Aap kis cheez par daav lagana chahenge? Safe bet par nahi — asli wale par.",
      idkRedirect:
        "Aapne doosri baar yeh kaha. Woh kaunsa jawab hai jise bolne mein dar lagta hai ki kahin woh bahut chhota, ajeeb ya unrealistic na lage?",
    },
    28: {
      text: "Woh ek kaam kya hai jo aap jaante hain aapko karna hai, par abhi tak kiya nahi hai?",
      idkRedirect:
        "Aap jaante hain. Kaafi waqt se jaante hain. 'No idea' likhne se theek pehle jo baat dimaag mein chamki thi — wahi wali. Keh dijiye.",
    },
    29: {
      text: "Apne khud ke shabdon mein, abhi ki apni top 3 priorities likhein, aur har ek ke liye ek chhota agla kadam batayein.",
    },
  },
};
