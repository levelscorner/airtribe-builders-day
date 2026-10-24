import type { Genre, Language } from "@chotu/shared";

const BEES = "why bees make honey";
const PICKLE = "a weekend offer on mango pickle";
const JAR = "a small glass jar of mango pickle";
const MONSOON = "how the indian monsoon starts";

const LINES: Record<string, Record<Language, string[]>> = {
  [`kids::${BEES}`]: {
    en: [
      "Chintu and Mini want to know why bees make honey. Come look.",
      "Bees visit flowers and carry away a sweet juice called nectar.",
      "They bring the nectar home and fan it with their wings until it turns thick.",
      "That honey is their food for the cold days. That is why they work so hard.",
      "Quiz! Does honey come from milk, from nectar, or from leaves? Say it out loud.",
    ],
    hi: [
      "Chintu और Mini जानना चाहते हैं कि मधुमक्खियाँ शहद क्यों बनाती हैं। आओ देखें।",
      "मधुमक्खियाँ फूलों से मीठा रस लेती हैं। इसे नेक्टर कहते हैं।",
      "वे रस को छत्ते में लाती हैं, और पंखों से सुखाती हैं, जब तक वह गाढ़ा शहद बन जाता है।",
      "यह शहद उनका खाना है, सर्दी के लिए। इसलिए वे इतनी मेहनत करती हैं।",
      "क्विज़! शहद दूध से बनता है, नेक्टर से, या पत्तों से? ज़ोर से बताओ।",
    ],
    hinglish: [
      "Chintu aur Mini jaan na chahte hain, bees honey kyun banati hain. Chalo dekhein.",
      "Bees phoolon se meetha juice laati hain. Usse nectar kehte hain.",
      "Woh nectar ko hive mein laati hain, aur pankhon se sukhati hain, jab tak woh gada honey ban jaaye.",
      "Yeh honey unka khana hai, thandi dinon ke liye. Isliye woh itni mehnat karti hain.",
      "Quiz! Honey doodh se banta hai, nectar se, ya patton se? Zor se batao.",
    ],
  },
  [`ad::${PICKLE}::${JAR}`]: {
    en: [
      "Wait. This week, home-style mango pickle can land on your table.",
      "Shop pickle is often too salty, or it has no real mango taste.",
      "This is a small glass jar: raw mango, mustard seed, and turmeric. No harsh chemicals.",
      "This weekend, buy one jar and get the second at half price, while the stock lasts.",
      "Tap the link, or say Riya's name at the shop. Try it today.",
    ],
    hi: [
      "रुको। इस हफ्ते घर जैसा आम का अचार तुम्हारी थाली तक आ सकता है।",
      "बाज़ार का अचार अक्सर या तो बहुत नमकीन होता है, या उसमें आम का स्वाद ही नहीं होता।",
      "यह एक छोटा काँच का जार है: कच्चे आम, सरसों, और हल्दी। कोई तेज़ केमिकल नहीं।",
      "इस वीकेंड एक जार लो, दूसरा आधे दाम पर। जब तक स्टॉक रहे।",
      "लिंक दबाओ, या दुकान पर Riya का नाम बोल दो। आज ही आज़माओ।",
    ],
    hinglish: [
      "Ruko! Is hafte ghar jaisa aam ka achaar seedha tumhare table pe.",
      "Bazaar wala achaar aksar ya to bahut namkeen hota hai, ya swaad hi gayab hota hai.",
      "Yeh ek chhota glass jar hai: kacche aam, sarson, aur haldi. Koi tez chemical nahi.",
      "Is weekend ek jar lo, doosra aadhe daam pe. Jab tak stock chale.",
      "Link dabao, ya dukaan pe Riya ka naam bol do. Aaj hi try karo.",
    ],
  },
  [`faceless::${MONSOON}`]: {
    en: [
      "Every June, a wind from the sea turns half of India green. Here is how the monsoon actually starts.",
      "Moist air travels off the Arabian Sea and meets the hot land.",
      "The Western Ghats push that air upward, so the first heavy rain falls on the west coast.",
      "The same wind then moves north and east, which is why Kerala sees rain before Delhi.",
      "So the monsoon is not one cloud. It is a seasonal wind, a mountain wall, and a calendar you can follow.",
    ],
    hi: [
      "हर जून में समुद्र से एक हवा भारत के आधे हिस्से को हरा कर देती है। मानसून असल में कैसे शुरू होता है?",
      "नम हवा अरब सागर से उठकर गर्म ज़मीन से मिलती है।",
      "पश्चिमी घाट उस हवा को ऊपर धकेलते हैं, इसलिए पहली तेज़ बारिश पश्चिमी तट पर गिरती है।",
      "फिर वही हवा उत्तर और पूर्व जाती है। इसलिए केरल में बारिश दिल्ली से पहले होती है।",
      "मानसून एक बादल नहीं है। यह एक मौसमी हवा है, पहाड़ों की दीवार, और एक कैलेंडर जिसे समझा जा सकता है।",
    ],
    hinglish: [
      "Har June mein samundar se ek hawa aadhe India ko hara kar deti hai. Monsoon asal mein kaise shuru hota hai?",
      "Gili hawa Arabian Sea se uthkar garam zameen se milti hai.",
      "Western Ghats us hawa ko upar dhakelte hain, isliye pehli tez baarish west coast par girti hai.",
      "Phir wahi hawa north aur east jaati hai. Isliye Kerala mein baarish Delhi se pehle hoti hai.",
      "Monsoon ek badal nahi hai. Yeh ek mausami hawa hai, ek pahad ki deewar, aur ek calendar jise tum pehchaan sakte ho.",
    ],
  },
};

export function libraryLines(
  genre: Genre,
  language: Language,
  topic: string,
  product: string,
): string[] | undefined {
  const key =
    genre === "ad" ? `${genre}::${topic}::${product}` : `${genre}::${topic}`;
  return LINES[key]?.[language];
}

function fill(lines: string[], topic: string, product: string): string[] {
  return lines.map((line) => line.replaceAll("{{topic}}", topic).replaceAll("{{product}}", product));
}

const GENERIC: Record<Genre, Record<Language, string[]>> = {
  kids: {
    en: [
      "Hi! Today we find out {{topic}}.",
      "First clue: {{topic}} starts with something you can see.",
      "Next, {{topic}} changes in one small step.",
      "Remember this: {{topic}} shows up in ordinary life.",
      "Quiz! Can you explain {{topic}} in one sentence? Say it out loud.",
    ],
    hi: [
      "नमस्ते! आज हम समझेंगे {{topic}}।",
      "पहला संकेत: {{topic}} किसी ऐसी चीज़ से शुरू होता है जिसे तुम देख सकते हो।",
      "फिर {{topic}} एक छोटे कदम में बदलता है।",
      "याद रखो: {{topic}} रोज़ की ज़िंदगी में दिखता है।",
      "क्विज़! क्या तुम {{topic}} को एक वाक्य में बता सकते हो? ज़ोर से बोलो।",
    ],
    hinglish: [
      "Hi! Aaj hum samjhenge {{topic}}.",
      "Pehla clue: {{topic}} kisi aisi cheez se shuru hota hai jo tum dekh sakte ho.",
      "Phir {{topic}} ek chhote step mein badalta hai.",
      "Yaad rakho: {{topic}} roz ki zindagi mein dikhta hai.",
      "Quiz! Kya tum {{topic}} ko ek sentence mein bata sakte ho? Zor se bolo.",
    ],
  },
  ad: {
    en: [
      "Stop. Here is {{topic}}.",
      "The usual choice lets people down.",
      "Look at {{product}}. Plain, clear, and easy to understand.",
      "The offer is simple, and it will not last forever.",
      "If this is for you, act today.",
    ],
    hi: [
      "रुको। यह है {{topic}}।",
      "आम चुनाव अक्सर निराश कर देता है।",
      "{{product}} को देखो। साफ़, सीधा, और आसान।",
      "ऑफ़र सरल है, और हमेशा नहीं रहेगा।",
      "अगर यह तुम्हारे लिए है, तो आज ही करो।",
    ],
    hinglish: [
      "Ruko. Yeh hai {{topic}}.",
      "Aam choice aksar disappoint karti hai.",
      "{{product}} ko dekho. Saaf, seedha, aur aasaan.",
      "Offer simple hai, aur hamesha nahi rahega.",
      "Agar yeh tumhare liye hai, to aaj hi karo.",
    ],
  },
  faceless: {
    en: [
      "Here is a curious thing: {{topic}}.",
      "Start with the cause, not the rumour.",
      "One clear step explains {{topic}}.",
      "A second step shows why the timing matters.",
      "So {{topic}} is a pattern you can recognise.",
    ],
    hi: [
      "एक जिज्ञासा: {{topic}}।",
      "अफ़वाह से नहीं, कारण से शुरू करो।",
      "एक साफ़ कदम {{topic}} को समझाता है।",
      "दूसरा कदम बताता है कि समय क्यों मायने रखता है।",
      "इसलिए {{topic}} एक पैटर्न है जिसे पहचाना जा सकता है।",
    ],
    hinglish: [
      "Ek curiosity: {{topic}}.",
      "Afwaah se nahi, reason se shuru karo.",
      "Ek saaf step {{topic}} ko samjhata hai.",
      "Doosra step batata hai ki timing kyun matter karti hai.",
      "Isliye {{topic}} ek pattern hai jise pehchana ja sakta hai.",
    ],
  },
};

export function genericLines(genre: Genre, language: Language, topic: string, product: string): string[] {
  return fill(GENERIC[genre][language], topic, product);
}
