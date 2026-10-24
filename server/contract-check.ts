import type { Credits, MockableFactory, Payments, Renderer } from "../packages/shared/types.ts";
import { createCredits } from "./src/credits/index.js";
import { createPayments } from "./src/payments/index.js";
import { createRenderer } from "./src/render/index.js";

const creditsFactory: MockableFactory<Credits> = createCredits;
const paymentsFactory: MockableFactory<Payments> = createPayments;
const rendererFactory: MockableFactory<Renderer> = createRenderer;
void creditsFactory;
void paymentsFactory;
void rendererFactory;
