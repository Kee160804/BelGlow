import "server-only";

type GatewayResponse = {
  errorCode?: number | string;
  errorMessage?: string;
  orderId?: string;
  orderID?: string;
  formURL?: string;
  formUrl?: string;
  orderStatus?: number | string;
  amount?: number | string;
};

function gatewayConfig() {
  const base = process.env.BELIZE_BANK_PAYMENT_URL?.trim().replace(/\/+$/, "");
  const username = process.env.BELIZE_BANK_USERNAME?.trim();
  const password = process.env.BELIZE_BANK_PASSWORD?.trim();
  if (!base || !username || !password) throw new Error("Belize Bank hosted payments are not configured.");
  const url = new URL(base);
  if (url.protocol !== "https:" || !["sandbox.belizebank.com", "gateway.belizebank.com"].includes(url.hostname) || url.pathname !== "/payment/rest") {
    throw new Error("The Belize Bank payment URL is not an approved hosted-gateway endpoint.");
  }
  return { base, username, password };
}

async function postGateway(endpoint: string, fields: Record<string, string | number>) {
  const config = gatewayConfig();
  const body = new URLSearchParams({
    userName: config.username,
    password: config.password,
    ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, String(value)])),
  });
  const response = await fetch(`${config.base}/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Belize Bank returned HTTP ${response.status}.`);
  let result: GatewayResponse;
  try { result = await response.json() as GatewayResponse; }
  catch { throw new Error("Belize Bank returned an unreadable response."); }
  if (result.errorCode !== undefined && String(result.errorCode) !== "0") {
    throw new Error(result.errorMessage || "Belize Bank could not start the payment.");
  }
  return result;
}

export async function registerBelizeBankPayment(input: {
  amountCents: number;
  reference: string;
  description: string;
  returnUrl: string;
  callbackUrl: string;
}) {
  const result = await postGateway("register.do", {
    amount: input.amountCents,
    description: input.description,
    returnURL: input.returnUrl,
    orderNumber: input.reference,
    dynamicCallBackUrl: input.callbackUrl,
  });
  const orderId = result.orderId ?? result.orderID;
  const formUrl = result.formURL ?? result.formUrl;
  if (!orderId || !formUrl) throw new Error(result.errorMessage || "Belize Bank did not return its hosted payment details.");
  const paymentUrl = new URL(formUrl);
  if (paymentUrl.protocol !== "https:" || paymentUrl.username || paymentUrl.password) {
    throw new Error("Belize Bank returned an invalid hosted payment URL.");
  }
  return { orderId, formUrl: paymentUrl.toString() };
}

export async function getBelizeBankPaymentStatus(orderId: string) {
  const result = await postGateway("getOrderStatusExtended.do", { orderId });
  return {
    status: Number(result.orderStatus),
    amountCents: Number(result.amount),
  };
}
