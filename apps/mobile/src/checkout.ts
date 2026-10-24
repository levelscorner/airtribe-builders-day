import type { CheckoutResponse } from "@chotu/shared";
import { getStudioClient } from "./api";

/**
 * Swap point for Mars's Pine Labs checkout.
 * createCheckout(packId) -> { orderId, checkoutUrl? }
 * The mock never opens a network request. A real client can replace `createCheckout`.
 */
export interface CheckoutSession {
  orderId: string;
  /** Hosted page when Mars returns one. The mock locator is mock:// and the screen does not open it. */
  checkoutUrl?: string;
}

export type CreateCheckout = (packId: string) => Promise<CheckoutSession>;

export function sessionFromCheckout(response: CheckoutResponse): CheckoutSession {
  return {
    orderId: response.paymentId,
    checkoutUrl: response.checkoutUrl,
  };
}

async function mockCreateCheckout(packId: string): Promise<CheckoutSession> {
  const response = await getStudioClient().checkout({ packId });
  return sessionFromCheckout(response);
}

let createCheckoutImpl: CreateCheckout = mockCreateCheckout;

export function setCreateCheckout(next: CreateCheckout): void {
  createCheckoutImpl = next;
}

export function createCheckout(packId: string): Promise<CheckoutSession> {
  return createCheckoutImpl(packId);
}
