/**
 * /subscribe/ page: monthly and yearly Checkout buttons.
 */

import { startSubscriptionCheckout } from "./checkout-start";

function init(): void {
  const buttons = document.querySelectorAll<HTMLElement>("[data-checkout-price]");
  let anyPrice = false;
  buttons.forEach((btn) => {
    const priceId = btn.dataset.checkoutPrice?.trim();
    if (!priceId) {
      (btn as HTMLButtonElement).disabled = true;
      return;
    }
    anyPrice = true;
    btn.addEventListener("click", () => {
      void startSubscriptionCheckout(priceId, {
        successPath: "/subscribe/success",
        cancelPath: "/subscribe/cancel",
      });
    });
  });
  if (!anyPrice) {
    document.getElementById("subscribe-config-hint")?.classList.remove("hidden");
  }
}

document.addEventListener("DOMContentLoaded", init);
