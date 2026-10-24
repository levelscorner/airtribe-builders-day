import type { Credits, MockableFactory, Payments } from "../packages/shared/types.ts";
import { createCredits } from "./src/credits/index.js";
import { createPayments } from "./src/payments/index.js";

const creditsFactory: MockableFactory<Credits> = createCredits;
const paymentsFactory: MockableFactory<Payments> = createPayments;
void creditsFactory;
void paymentsFactory;
