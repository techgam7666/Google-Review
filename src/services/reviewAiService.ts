import type {
  ReviewGenerationInput,
  ReviewGenerationResult,
  SentimentBucket,
} from '../types/review';

export function getSentimentBucket(rating: number): SentimentBucket {
  if (rating >= 4) return 'positive';
  if (rating === 3) return 'neutral';
  return 'negative';
}

export function getRatingLabel(rating: number): string {
  switch (rating) {
    case 5:
      return 'Excellent experience';
    case 4:
      return 'Good experience';
    case 3:
      return 'Average experience';
    case 2:
      return 'Needs improvement';
    case 1:
      return 'Very dissatisfied';
    default:
      return 'Select your star rating';
  }
}

function cleanPhrase(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '');
}

function lowerFirst(phrase: string): string {
  if (!phrase) return '';
  if (
    phrase.length > 1 &&
    phrase[0] === phrase[0].toUpperCase() &&
    phrase[1] === phrase[1].toUpperCase()
  ) {
    return phrase;
  }
  if (phrase.startsWith('I ') || phrase.startsWith("I'")) {
    return phrase;
  }
  return phrase.charAt(0).toLowerCase() + phrase.slice(1);
}

function generateEnglishMockReview(input: ReviewGenerationInput): string {
  const { businessName, rating, primaryAnswer, secondaryAnswer, variationIndex } = input;
  const p1 = cleanPhrase(primaryAnswer);
  const p2 = cleanPhrase(secondaryAnswer);
  const v = variationIndex % 3;

  if (rating >= 4) {
    const isFive = rating === 5;
    if (!p1 && !p2) {
      const templates = isFive
        ? [
            `Had a wonderful experience at ${businessName}. Everything felt welcoming and well put together from start to finish. Would gladly visit again.`,
            `Really enjoyed my visit to ${businessName}. Great overall quality and a smooth, pleasant experience throughout. Highly recommended.`,
            `Visited ${businessName} recently and came away thoroughly impressed. Consistently good experience and a place I would happily return to.`,
          ]
        : [
            `Had a good visit to ${businessName}. Overall it was a pleasant, comfortable experience and worth stopping by.`,
            `Enjoyed my time at ${businessName}. Solid overall experience and smooth visit from start to finish.`,
            `Good experience at ${businessName}. Everything went smoothly and I would be happy to visit again.`,
          ];
      return templates[v];
    }

    const parts: string[] = [];
    if (v === 0) {
      parts.push(
        isFive
          ? `Had a great visit to ${businessName}.`
          : `Had a good experience at ${businessName}.`
      );
      if (p1) parts.push(`Especially liked ${lowerFirst(p1)}.`);
      if (p2) parts.push(`As for the service, ${lowerFirst(p2)}.`);
      parts.push(isFive ? `Would definitely recommend visiting.` : `Worth checking out.`);
    } else if (v === 1) {
      if (p1 && p2) {
        parts.push(
          `${isFive ? 'Really enjoyed' : 'Enjoyed'} visiting ${businessName} — particularly ${lowerFirst(p1)}.`
        );
        parts.push(`On the service side, ${lowerFirst(p2)}.`);
        parts.push(isFive ? `Happily coming back soon.` : `Overall a solid visit.`);
      } else if (p1) {
        parts.push(
          `Visited ${businessName} and ${isFive ? 'loved' : 'appreciated'} ${lowerFirst(p1)}.`
        );
        parts.push(
          isFive
            ? `Everything felt thoughtfully handled and welcoming.`
            : `Overall a pleasant visit.`
        );
      } else {
        parts.push(`Had a smooth visit to ${businessName}.`);
        parts.push(`Regarding the service, ${lowerFirst(p2)}.`);
        parts.push(isFive ? `Would gladly visit again.` : `Good experience overall.`);
      }
    } else {
      parts.push(
        isFive
          ? `${businessName} delivered a genuinely pleasant experience.`
          : `Good overall visit at ${businessName}.`
      );
      if (p1) parts.push(`What stood out for me was ${lowerFirst(p1)}.`);
      if (p2) parts.push(`The service experience: ${lowerFirst(p2)}.`);
    }
    return parts.join(' ');
  }

  if (rating === 3) {
    if (!p1 && !p2) {
      const templates = [
        `Had an average experience at ${businessName}. Parts of the visit were fine, though there is room for better consistency overall.`,
        `My visit to ${businessName} was okay overall. Nothing major went wrong, but a little extra attention to detail would make it much better.`,
        `Decent visit to ${businessName}, though it felt somewhat mixed overall. With a few improvements it could easily be a much stronger experience.`,
      ];
      return templates[v];
    }

    if (v === 0) {
      const lines = [`Had a mixed experience at ${businessName}.`];
      if (p1) lines.push(`On the positive side, ${lowerFirst(p1)}.`);
      if (p2) lines.push(`However, ${lowerFirst(p2)} could be improved.`);
      return lines.join(' ');
    }
    if (v === 1) {
      const lines = [`My visit to ${businessName} was average overall.`];
      if (p1) lines.push(`What went well: ${lowerFirst(p1)}.`);
      if (p2) lines.push(`Where they can do better: ${lowerFirst(p2)}.`);
      return lines.join(' ');
    }
    const lines = [`Decent stop at ${businessName}, though there is room to improve.`];
    if (p1) lines.push(`Appreciated ${lowerFirst(p1)}.`);
    if (p2) lines.push(`At the same time, ${lowerFirst(p2)} needs more attention.`);
    return lines.join(' ');
  }

  const isOneStar = rating === 1;
  if (!p1 && !p2) {
    const templates = isOneStar
      ? [
          `Had a very disappointing experience at ${businessName}. My visit fell well short of basic expectations and needs serious improvement.`,
          `Not satisfied with my visit to ${businessName}. Several fundamentals fell short during my time there, and I hope management addresses them.`,
          `Unfortunately had a poor experience at ${businessName}. The overall standard did not meet expectations.`,
        ]
      : [
          `Below-average experience at ${businessName}. The visit fell short of expectations in a few areas and needs improvement.`,
          `My recent visit to ${businessName} was underwhelming. There are clear areas that need closer attention from the team.`,
          `Not a great visit to ${businessName} this time. Hopefully the team works on improving consistency for future guests.`,
        ];
    return templates[v];
  }

  if (v === 0) {
    const lines = [
      isOneStar
        ? `Had a disappointing experience at ${businessName}.`
        : `Below-average visit to ${businessName}.`,
    ];
    if (p1) lines.push(`Main issue during my visit: ${lowerFirst(p1)}.`);
    if (p2) lines.push(`Going forward, ${lowerFirst(p2)} really needs improvement.`);
    return lines.join(' ');
  }
  if (v === 1) {
    const lines = [
      isOneStar
        ? `Left ${businessName} quite dissatisfied with the experience.`
        : `My experience at ${businessName} fell short of expectations.`,
    ];
    if (p1) lines.push(`Specifically, ${lowerFirst(p1)}.`);
    if (p2) lines.push(`I hope the management focuses on ${lowerFirst(p2)}.`);
    return lines.join(' ');
  }
  const lines = [
    isOneStar
      ? `Unfortunately had a poor visit at ${businessName}.`
      : `Not satisfied with how things went at ${businessName}.`,
  ];
  if (p1) lines.push(`What went wrong: ${lowerFirst(p1)}.`);
  if (p2) lines.push(`What should be improved: ${lowerFirst(p2)}.`);
  return lines.join(' ');
}

function generateHindiMockReview(input: ReviewGenerationInput): string {
  const { businessName, rating, primaryAnswer, secondaryAnswer, variationIndex } = input;
  const p1 = cleanPhrase(primaryAnswer);
  const p2 = cleanPhrase(secondaryAnswer);
  const v = variationIndex % 3;

  if (rating >= 4) {
    const isFive = rating === 5;
    if (!p1 && !p2) {
      const templates = isFive
        ? [
            `${businessName} में मेरा अनुभव बहुत शानदार रहा। माहौल और व्यवस्था शुरू से अंत तक काफी अच्छी लगी। यहाँ दोबारा ज़रूर आना चाहूँगा।`,
            `${businessName} का अनुभव वाकई बहुत अच्छा रहा। सब कुछ सुव्यवस्थित और सुखद था। मैं इसे ज़रूर रिकमेंड करूँगा।`,
            `हाल ही में ${businessName} गया और कुल मिलाकर अनुभव बेहतरीन रहा। क्वालिटी और माहौल दोनों काफी पसंद आए।`,
          ]
        : [
            `${businessName} में अनुभव अच्छा रहा। कुल मिलाकर माहौल आरामदायक और संतोषजनक लगा।`,
            `${businessName} की विज़िट अच्छी रही। सब कुछ ठीक रहा और यहाँ फिर से आया जा सकता है।`,
            `${businessName} में समय अच्छा बीता। कुल मिलाकर एक अच्छा और सहज अनुभव रहा।`,
          ];
      return templates[v];
    }

    const lines = [
      isFive
        ? `${businessName} में मेरा अनुभव बहुत बढ़िया रहा।`
        : `${businessName} में मेरा अनुभव अच्छा रहा।`,
    ];
    if (p1) {
      lines.push(v === 1 ? `खास तौर पर ${p1} काफी पसंद आया।` : `मुझे यहाँ ${p1} अच्छा लगा।`);
    }
    if (p2) {
      lines.push(v === 2 ? `सर्विस अनुभव की बात करें तो ${p2}।` : `सर्विस के मामले में ${p2}।`);
    }
    lines.push(isFive ? `यहाँ आने की पूरी सलाह दूँगा।` : `कुल मिलाकर अच्छी जगह है।`);
    return lines.join(' ');
  }

  if (rating === 3) {
    if (!p1 && !p2) {
      const templates = [
        `${businessName} में अनुभव ठीक-ठाक रहा। कुछ चीज़ें सही थीं, लेकिन कुल मिलाकर अभी थोड़ा सुधार हो सकता है।`,
        `${businessName} की विज़िट औसत रही। कोई बड़ी शिकायत नहीं है, पर थोड़ी बेहतर निरंतरता से अनुभव और अच्छा हो सकता है।`,
        `${businessName} में मिला-जुला अनुभव रहा। कुछ पहलुओं पर थोड़ा और ध्यान दिया जाए तो काफी बेहतर होगा।`,
      ];
      return templates[v];
    }

    const lines = [`${businessName} में मेरा अनुभव मिला-जुला रहा।`];
    if (p1) lines.push(`अच्छी बात यह रही कि ${p1}।`);
    if (p2) lines.push(`हालांकि, ${p2} के मामले में सुधार की ज़रूरत है।`);
    return lines.join(' ');
  }

  const isOneStar = rating === 1;
  if (!p1 && !p2) {
    const templates = isOneStar
      ? [
          `${businessName} में मेरा अनुभव काफी निराशाजनक रहा। व्यवस्था उम्मीद के मुताबिक बिल्कुल नहीं थी और इसमें गंभीर सुधार की ज़रूरत है।`,
          `${businessName} की विज़िट से संतुष्ट नहीं हूँ। बुनियादी चीज़ों में कमी दिखी, उम्मीद है प्रबंधन इस पर ध्यान देगा।`,
          `दुर्भाग्य से ${businessName} में अनुभव बहुत खराब रहा। क्वालिटी और व्यवस्था दोनों में सुधार आवश्यक है।`,
        ]
      : [
          `${businessName} में अनुभव उम्मीद से कम रहा। कुछ बुनियादी पहलुओं पर टीम को सुधार करने की ज़रूरत है।`,
          `इस बार ${businessName} का अनुभव खास नहीं रहा। उम्मीद है आगे बेहतर ध्यान दिया जाएगा।`,
          `${businessName} में कई चीज़ें बेहतर हो सकती थीं। कुल मिलाकर अनुभव औसत से नीचे रहा।`,
        ];
    return templates[v];
  }

  const lines = [
    isOneStar
      ? `${businessName} में मेरा अनुभव काफी निराशाजनक रहा।`
      : `${businessName} में अनुभव उम्मीद के मुताबिक नहीं रहा।`,
  ];
  if (p1) lines.push(`मुख्य समस्या यह रही: ${p1}।`);
  if (p2) lines.push(`आगे के लिए ${p2} में सुधार बेहद ज़रूरी है।`);
  return lines.join(' ');
}

function generateHinglishMockReview(input: ReviewGenerationInput): string {
  const { businessName, rating, primaryAnswer, secondaryAnswer, variationIndex } = input;
  const p1 = cleanPhrase(primaryAnswer);
  const p2 = cleanPhrase(secondaryAnswer);
  const v = variationIndex % 3;

  if (rating >= 4) {
    const isFive = rating === 5;
    if (!p1 && !p2) {
      const templates = isFive
        ? [
            `${businessName} mein mera experience kaafi badiya raha. Overall vibe aur arrangement start se end tak smooth tha. Definitely worth visiting again.`,
            `Recently ${businessName} visit kiya aur sach mein bahut accha laga. Sab kuch well-managed tha, zaroor recommend karunga.`,
            `${businessName} ka overall experience super smooth aur pleasant raha. Quality aur atmosphere dono kaafi pasand aaye.`,
          ]
        : [
            `${businessName} mein accha experience raha. Overall visit comfortable aur smooth thi.`,
            `Visited ${businessName} recently — kaafi decent aur pleasant experience raha overall.`,
            `${businessName} mein time accha spend hua. Overall ek solid jagah hai visit karne ke liye.`,
          ];
      return templates[v];
    }

    const lines = [
      isFive
        ? `${businessName} mein visit kaafi badiya rahi.`
        : `${businessName} mein overall accha experience raha.`,
    ];
    if (p1) {
      lines.push(
        v === 1
          ? `Specially ${lowerFirst(p1)} kaafi pasand aaya.`
          : `Mujhe yahan ${lowerFirst(p1)} bahut sahi laga.`
      );
    }
    if (p2) {
      lines.push(
        v === 2
          ? `Service ki baat karein toh ${lowerFirst(p2)}.`
          : `Aur service side pe, ${lowerFirst(p2)}.`
      );
    }
    lines.push(isFive ? `Definitely recommend karunga.` : `Worth a visit overall.`);
    return lines.join(' ');
  }

  if (rating === 3) {
    if (!p1 && !p2) {
      const templates = [
        `${businessName} mein experience theek-thaak raha. Kuch cheezein sahi thi, par overall consistency thodi aur better ho sakti hai.`,
        `Meri ${businessName} visit average rahi. Koi major issue nahi tha, bas thoda aur attention to detail hota toh better lagta.`,
        `${businessName} ka experience mixed raha. Thode improvements ke saath yeh jagah kaafi better ho sakti hai.`,
      ];
      return templates[v];
    }

    const lines = [`${businessName} mein mera experience mixed raha.`];
    if (p1) lines.push(`Acchi baat yeh thi ki ${lowerFirst(p1)}.`);
    if (p2) lines.push(`Lekin ${lowerFirst(p2)} pe thoda improvement hona chahiye.`);
    return lines.join(' ');
  }

  const isOneStar = rating === 1;
  if (!p1 && !p2) {
    const templates = isOneStar
      ? [
          `${businessName} mein experience kaafi disappointing raha. Basic expectations bhi meet nahi hui aur kaafi improvement ki zaroorat hai.`,
          `${businessName} ki visit se bilkul satisfied nahi hoon. Management ko basic standards pe seriously kaam karna chahiye.`,
          `Unfortunately ${businessName} mein poor experience raha. Overall arrangement kaafi underwhelming tha.`,
        ]
      : [
          `${businessName} mein experience expectations se kam raha. Kuch areas mein team ko definitely improve karna chahiye.`,
          `Is baar ${businessName} ki visit thodi disappointing rahi. Hopefully management consistency pe dhyan degi.`,
          `${businessName} mein kaafi cheezein better ho sakti thi. Overall below-average experience raha.`,
        ];
    return templates[v];
  }

  const lines = [
    isOneStar
      ? `${businessName} mein experience kaafi disappointing raha.`
      : `${businessName} mein visit expectations ke hisaab se nahi rahi.`,
  ];
  if (p1) lines.push(`Main issue yeh raha: ${lowerFirst(p1)}.`);
  if (p2) lines.push(`Aage ke liye ${lowerFirst(p2)} improve hona bahut zaroori hai.`);
  return lines.join(' ');
}

export function generateMockReviewSync(input: ReviewGenerationInput): string {
  switch (input.language) {
    case 'Hindi':
      return generateHindiMockReview(input);
    case 'Hinglish':
      return generateHinglishMockReview(input);
    case 'English':
    default:
      return generateEnglishMockReview(input);
  }
}

export async function generateCustomerReview(
  input: ReviewGenerationInput
): Promise<ReviewGenerationResult> {
  try {
    const response = await fetch('/api/reviews/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: input.businessName,
        category: input.category,
        locationLabel: input.locationLabel ?? '',
        rating: input.rating,
        language: input.language,
        primaryAnswer: input.primaryAnswer,
        secondaryAnswer: input.secondaryAnswer,
        variationSeed: input.variationIndex,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        review?: string;
        provider?: 'gemini' | 'openrouter';
      };
      if (data.review && data.review.trim().length > 0) {
        return {
          review: data.review.trim(),
          source: data.provider === 'openrouter' ? 'openrouter' : 'gemini',
        };
      }
    }
  } catch {
    // Graceful offline / network fallback
  }

  await new Promise((resolve) => setTimeout(resolve, 160));
  return {
    review: generateMockReviewSync(input),
    source: 'mock',
  };
}
