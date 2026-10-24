import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { env } from "../env.js";
import type { Job } from "../jobs/types.js";
import { ScriptSchema, type Script } from "../jobs/types.js";

const STYLE_HINT: Record<Job["style"], string> = {
  "watercolor-storybook":
    "soft watercolor storybook illustration, gentle washes, warm paper texture, friendly characters",
  cartoon: "bright flat cartoon for kids, bold outlines, playful shapes, cheerful colors",
};

function mockScript(job: Job): Script {
  const topic = job.topic;
  const hi = job.language === "hi";
  if (hi) {
    return {
      title: `${topic} — छोटी कहानी`,
      scenes: [
        {
          narration: `नमस्ते! आज हम सीखेंगे ${topic} के बारे में — बिलकुल आसान भाषा में।`,
          imagePrompt: `A curious friendly child looking at a big picture book about ${topic}, ${STYLE_HINT[job.style]}`,
        },
        {
          narration: `${topic} का मतलब है कुछ खास जो रोज की जिंदगी में दिखता है। चलो एक मिसाल देखते हैं।`,
          imagePrompt: `Simple classroom scene explaining ${topic} with colorful props, ${STYLE_HINT[job.style]}`,
        },
        {
          narration: `सोचो अगर तुम इसे छू सकते या देख सकते — कैसा लगेगा? यही इसकी जादुई बात है।`,
          imagePrompt: `Magical close-up moment connected to ${topic}, wonder in a child's eyes, ${STYLE_HINT[job.style]}`,
        },
        {
          narration: `याद रखने की ट्रिक: छोटे-छोटे कदम, और सवाल पूछते रहो।`,
          imagePrompt: `Child writing a tip about ${topic} on a chalkboard, ${STYLE_HINT[job.style]}`,
        },
        {
          narration: `बस! अब तुम ${topic} को दोस्तों को भी समझा सकते हो। अलविदा!`,
          imagePrompt: `Happy kids waving goodbye under a banner saying ${topic}, ${STYLE_HINT[job.style]}`,
        },
      ],
    };
  }
  return {
    title: `All about ${topic}`,
    scenes: [
      {
        narration: `Hi friend! Today we explore ${topic} in a tiny story — easy words, big wonder.`,
        imagePrompt: `A curious friendly child opening a picture book about ${topic}, ${STYLE_HINT[job.style]}`,
      },
      {
        narration: `${topic} is something you can notice in everyday life. Let's look at a simple example.`,
        imagePrompt: `Simple classroom scene explaining ${topic} with colorful props, ${STYLE_HINT[job.style]}`,
      },
      {
        narration: `Imagine you could see or touch it up close — how would it feel? That's the magic part.`,
        imagePrompt: `Magical close-up moment connected to ${topic}, wonder in a child's eyes, ${STYLE_HINT[job.style]}`,
      },
      {
        narration: `Remember this tip: take small steps, and keep asking curious questions.`,
        imagePrompt: `Child writing a tip about ${topic} on a chalkboard, ${STYLE_HINT[job.style]}`,
      },
      {
        narration: `That's it! Now you can explain ${topic} to a friend. Bye for now!`,
        imagePrompt: `Happy kids waving goodbye under a banner about ${topic}, ${STYLE_HINT[job.style]}`,
      },
    ],
  };
}

export async function runScriptNode(job: Job): Promise<Script> {
  if (env.mockMode) {
    return mockScript(job);
  }

  const openai = createOpenAI({ apiKey: env.openaiApiKey });
  const lang = job.language === "hi" ? "Hindi (Devanagari)" : "English";
  const styleHint = STYLE_HINT[job.style];

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: ScriptSchema,
    prompt: `You write short kids explainer scripts (ages 5–9).

Topic: ${job.topic}
Language for narration: ${lang}
Visual style for every imagePrompt: ${styleHint}

Rules:
- Exactly 4 or 5 scenes.
- Total spoken length ~30–45 seconds when read aloud (short sentences).
- Each scene has narration (spoken) and imagePrompt (for an image model).
- imagePrompt must describe one clear frame, no text in the image, kid-safe, matching the style.
- Warm, friendly, never scary. No brand names.
- title: short and catchy.`,
  });

  return object;
}
