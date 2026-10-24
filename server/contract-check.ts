import type { Credits, MockableFactory } from "../packages/shared/types.ts";
import { createCredits } from "./src/credits/index.js";

const creditsFactory: MockableFactory<Credits> = createCredits;
void creditsFactory;
