// Buddy 2.0: deterministic intent routing, independent of any AI-generated offers.
// Do not assume merchant product catalogs or live price data are available.
const WORDS = {
  coupons: /(?:coupon|promo\s*code|discount\s*code|voucher|كود|كوبون|قسيمة|رمز\s*خصم|خصم)/i,
  deal: /(?:deal|sale|offer|عروض?|تخفيضات|تخفيض|أوفر|توفير)/i,
  gifts: /(?:gift|present|هدية|هدايا)/i,
  product: /(?:buy|shop|find|looking for|price|سعر|اشتري|شراء|عايز|عاوز|بدور|دورلي|بكام)/i,
};
export function classifyShoppingIntent(query = '') {
  const text = String(query).trim();
  if (WORDS.coupons.test(text)) return 'coupon';
  if (WORDS.deal.test(text)) return 'deal';
  if (WORDS.gifts.test(text)) return 'gift';
  if (WORDS.product.test(text)) return 'product';
  return 'shopping';
}
export function normalizeMerchantName(name = '') {
  return String(name).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export function isSameMerchant(a, b) {
  const one = normalizeMerchantName(a), two = normalizeMerchantName(b);
  return Boolean(one && two && one === two);
}
export function isSafeOutboundUrl(url) {
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) && Boolean(parsed.hostname) &&
      !['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname);
  } catch { return false; }
}
